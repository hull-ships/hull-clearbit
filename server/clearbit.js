import _ from "lodash";
import jwt from "jwt-simple";

import Client from "./clearbit/client";

import { getDomain, now } from "./clearbit/utils";
import {
  shouldProspect,
  shouldProspectDomain,
  prospect
} from "./clearbit/prospect";
import { shouldEnrich, enrich } from "./clearbit/enrich";
import { shouldDiscover, discover } from "./clearbit/discover";
import { shouldReveal, reveal } from "./clearbit/reveal";
import {
  getUserTraitsFrom,
  getAccountTraitsFromCompany
} from "./clearbit/mapping";

const debug = require("debug")("hull-clearbit:clearbit_class");

const FILTERED_ERRORS = ["unknown_ip"];

export default class Clearbit {
  constructor({
    hull,
    connector,
    stream = false,
    hostSecret,
    metric,
    hostname
  }) {
    this.connector = connector;

    if (!connector.private_settings) {
      console.error("MissingPrivateSettingsError", connector); // eslint-disable-line no-console
    }

    const { api_key } = connector.private_settings || {};
    this.settings = {
      ...connector.private_settings,
      hostSecret,
      stream
    };
    this.hull = hull;
    this.hostname = hostname;
    this.metric = (m, value = 1, tags) => {
      if (_.isFunction(metric.increment)) {
        metric.increment(m, value, tags);
      }
    };

    if (api_key) {
      this.client = new Client(api_key, this.metric, this.hull);
    }
  }

  logSkip = (asUser, action, reason, additionalData = {}) => {
    asUser.logger.info("outgoing.user.skip", {
      reason,
      action,
      additionalData
    });
  };

  getDomain(account, user) {
    return getDomain(account, user, this.settings.lookup_domain || "domain");
  }

  /** *********************************************************
   * Clearbit Enrichment
   */

  shouldEnrich(message) {
    return this.shouldLogic(message, shouldEnrich);
  }

  shouldReveal(message) {
    return this.shouldLogic(message, shouldReveal);
  }

  shouldProspect(message) {
    return this.shouldLogic(message, shouldProspect);
  }

  shouldDiscover(message) {
    return this.shouldLogic(message, shouldDiscover);
  }

  shouldLogic(message, action) {
    if (!this.client) return { should: false, message: "no api_key set" };
    const should = action(this.settings, message);
    debug(action.name, should);
    return should;
  }

  /**
   * Build context to pass a webhook_id
   * @param  {String} userId - Hull User id
   * @return {String}
   */
  getWebhookId(payload = {}) {
    const { id, secret, organization } = this.hull.configuration();
    const claims = {
      ship: id,
      secret,
      organization,
      ...payload
    };
    const { hostSecret } = this.settings;
    return hostSecret && jwt.encode(claims, hostSecret);
  }

  async enrich(message = {}) {
    const { user, account } = message;
    const logError = error => {
      this.hull.asUser(user).logger.info("outgoing.user.error", {
        errors: error,
        method: "enrichUser"
      });
    };
    try {
      this.metric("enrich");
      const response = await enrich({
        settings: this.settings,
        hostname,
        connector_id: this.connector.id,
        getWebhookId: this.getWebhookId,
        client: this.client,
        message
      });
      if (!response || !response.source) return false;
      const { person, company, source } = response;
      return Promise.all([
        user
          ? this.saveUser({ user, person, account, company }, { source })
          : Promise.resolve(),
        account
          ? this.saveAccount({ account, company }, { source })
          : Promise.resolve()
      ]).catch(logError);
    } catch (err) {
      logError(err);
      return Promise.reject(err);
    }
  }

  async reveal(message = {}) {
    const { user, account } = message;
    const asUser = this.hull.asUser(user);
    const logError = error => {
      // we filter error messages
      if (!_.includes(FILTERED_ERRORS, error.type)) {
        asUser.logger.info("outgoing.user.error", {
          errors: error,
          method: "revealUser"
        });
      }
    };
    try {
      this.metric("reveal");
      const response = await reveal({
        settings: this.settings,
        client: this.client,
        message
      });
      if (!response || !response.source) return false;
      const { company, source, ip } = response;
      return [
        this.saveUser({ user, company }, { source }),
        this.saveAccount(
          { account, user, company },
          {
            source,
            company: _.pick(company, "name", "domain"),
            ip
          }
        )
      ];
    } catch (err) {
      logError(err);
      return Promise.reject(err);
    }
  }

  async prospect(message = {}) {
    const { account } = message;
    const scope = account ? this.hull.asAccount(account) : this.hull;

    // const asAccount = this.hull.asAccount(account);
    const logError = error => {
      scope.logger.info("outgoing.account.error", {
        errors: _.get(error, "message", error),
        method: "prospectUser"
      });
    };

    // Since user update logic is synchronous,
    // There is a second, asynchronous part of checks in here.
    const { should, message: msg } = await shouldProspectDomain({
      domain: this.getDomain(account),
      hull: this.hull,
      settings: this.settings
    });

    if (!should) {
      logError(msg);
      return Promise.reject(msg);
    }

    try {
      this.metric("prospect");
      const { prospects, query } = await prospect({
        message,
        client: this.client,
        settings: this.settings
      });
      const log = {
        source: "prospector",
        message: `Found ${_.size(prospects)} new Prospects`,
        ...query,
        prospects
      };

      scope.logger.info("outgoing.user.success", log);

      // If we're scoped as Hull (and not as a User)
      // - when coming from the Prospector UI, then we can't add Track & Traits.
      if (scope.traits) {
        scope.traits({
          "clearbit/prospected_at": { value: now(), operation: "setIfNull" }
        });
      }

      if (scope.track) {
        scope.track(
          "Clearbit Prospector Triggered",
          {
            ..._.mapKeys(query, (v, k) => `query_${k}`),
            found: _.size(prospects),
            emails: _.keys(prospects)
          },
          { ip: 0 }
        );
      }
      return Promise.all(
        prospects.map(person =>
          this.saveProspect({
            account,
            person
          })
        )
      );
    } catch (err) {
      logError(err);
      return Promise.reject(err);
    }
  }

  /** *********************************************************
   * Clearbit Discovery
   */

  /**
   * Find companies similar to a given company
   * @param  {Company} domain - A company domain name
   * @param  {Object} filters - Criteria to use as filters
   * @return {Promise}
   */
  async discover({ account = {} }) {
    // TODO -> Support Accounts
    const domain = this.getDomain(account);
    const asAccount = this.hull.asAccount(account);

    try {
      // Let's not call the Discovery API if we have already done it before...
      const results = (await discover(account)) || [];
      if (!results || !results.length) {
        return asAccount.logger.info("outgoing.account.success", {
          reason: "no results from discovery attempt"
        });
      }
      if (account.id && !account["clearbit/discovered_similar_companies_at"]) {
        asAccount.traits(
          {
            "clearbit/discovered_similar_companies_at": now()
          },
          { sync: true }
        );
      }

      return this.saveDiscoveredCompanies(results, domain);
    } catch (err) {
      asAccount.logger.info("outgoing.user.error", {
        errors: _.get(err, "message", err)
      });
      return Promise.reject(err);
    }
  }

  saveDiscoveredCompanies(companies = [], discovered_from_domain) {
    // TODO -> Support Accounts
    return Promise.all(
      companies.map(company => {
        // TODO: save account instead of user
        const traits = {
          ...getAccountTraitsFromCompany(company),
          "clearbit/discovered_from_domain": {
            value: discovered_from_domain,
            operation: "setIfNull"
          },
          "clearbit/discovered_at": {
            value: now(),
            operation: "setIfNull"
          },
          "clearbit/source": {
            value: "discover",
            operation: "setIfNull"
          }
        };
        return this.hull
          .asAccount({
            anonymous_id: `clearbit-company:${company.id}`,
            domain: traits.domain
          })
          .traits(traits);
      })
    );
  }

  /**
   * Save traits on Hull user
   * @param  {Object} user - Hull User object
   * @param  {Object} person - Clearbit Person object
   * @return {Promise -> Object({ user, person })}
   */
  async saveUser({ user = {}, person = {}, company = {} }, options = {}) {
    const { source, incoming } = options;

    // Never ever change the email address (Clearbit strips +xxx parts, so we end up with complete
    // messed up ident claims if we do this). We need to pass all claims
    // to the platform to allow proper identity resolution.
    const ident = _.pick(user, ["id", "external_id", "email"]);

    const direction = incoming ? "incoming" : "outgoing";

    if (!ident || !_.size(ident)) {
      const error = new Error("Missing identifier for user");
      error.status = 400;
      return Promise.reject(error);
    }

    const asUser = this.hull.asUser(ident);
    const traits = {
      ...getUserTraitsFrom(person, "Person"),
      ...getUserTraitsFrom(company, "PersonCompany"),
      "clearbit/fetched_at": { value: now(), operation: "setIfNull" }
    };

    if (source) {
      traits[`clearbit/${source}ed_at`] = {
        value: now(),
        operation: "setIfNull"
      };
      traits["clearbit/source"] = { value: source, operation: "setIfNull" };
    }

    this.metric(`ship.${direction}.users`, 1, ["saveUser"]);

    await asUser.traits(traits);
    asUser.logger.info(`${direction}.user.success`, { ...options, traits });
    return { traits, user, person, company };
  }

  /**
   * Save traits on Hull user
   * @param  {Object} user - Hull User object
   * @param  {Object} person - Clearbit Person object
   * @return {Promise -> Object({ user, person })}
   */
  saveAccount({ account = {}, company, user }, options = {}) {
    const { source, incoming } = options;
    const direction = incoming ? "incoming" : "outgoing";

    const traits = {
      ...getAccountTraitsFromCompany(company),
      "clearbit/fetched_at": { value: now(), operation: "setIfNull" }
    };

    if (source) {
      traits[`clearbit/${source}ed_at`] = {
        value: now(),
        operation: "setIfNull"
      };
      traits["clearbit/source"] = { value: source, operation: "setIfNull" };
    }

    const domain = account.domain || traits["clearbit/domain"];
    const asAccount = _.isEmpty(account)
      ? this.hull.asUser(user).account({ domain })
      : this.hull.asAccount({ ...account, domain });

    asAccount.logger.info(`${direction}.account.success`, {
      source,
      traits
    });

    this.metric(`ship.${direction}.accounts`, 1, ["saveAccount"]);

    return asAccount.traits(traits).then(() => {
      asAccount.logger.info(`${direction}.account.success`, {
        ...options,
        traits
      });
    });
  }

  /**
   * Create a new user on Hull from a discovered Prospect
   * @param  {Object({ person })} payload - Clearbit/Person object
   * @return {Promise -> Object({ person })}
   */
  saveProspect(account = {}, person = {}) {
    const traits = getUserTraitsFrom(person, "Prospect");
    const attribution = {
      "clearbit/prospected_at": { operation: "setIfNull", value: now() },
      "clearbit/source": { operation: "setIfNull", value: "prospector" }
    };
    // as a new user
    const scope = this.hull.asUser({
      email: person.email,
      anonymous_id: `clearbit-prospect:${person.id}`
    });

    this.metric("ship.incoming.users", 1, ["prospect"]);
    scope.logger.info("incoming.user.success", {
      personId: _.pick(person, "id"),
      source: "prospector"
    });

    scope.traits({ ...traits, ...attribution });

    // as the existing account
    const domain = account.domain || traits["clearbit/domain"];
    const accountScope = _.isEmpty(account)
      ? scope.account({ domain })
      : this.hull.asAccount({ ...account, domain });

    accountScope.logger.info("incoming.account.success", {
      person,
      source: "prospector"
    });

    return accountScope
      .traits({
        ...attribution,
        domain: { operation: "setIfNull", value: account["clearbit/domain"] }
      })
      .then(() => person);
  }
}
