import _ from "lodash";
import Promise from "bluebird";

import Client from "./clearbit/client";

import { isInSegments, getDomain, now } from "./clearbit/utils";
import {
  canProspect,
  shouldProspect,
  shouldprospectUserFromDomain
} from "./clearbit/prospect";
import { canEnrich, shouldEnrich, enrichUser } from "./clearbit/enrich";
import { canReveal, shouldReveal, revealUser } from "./clearbit/reveal";
import getUserTraitsFromPerson from "./clearbit/mapping";

const FILTERED_ERRORS = ["unknown_ip"];

export default class Clearbit {
  constructor({ hull, ship, stream = false, hostSecret, metric, hostname }) {
    this.ship = ship;

    if (!ship.private_settings) {
      console.error("MissingPrivateSettingsError", ship); // eslint-disable-line no-console
    }

    const { api_key } = ship.private_settings || {};
    this.settings = {
      ...ship.private_settings,
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

  /** *********************************************************
   * Clearbit Enrichment
   */

  canProspect(user, account) {
    return canProspect(user, account, this.settings);
  }

  canReveal(user) {
    return canReveal(user, this.settings);
  }

  canEnrich(user) {
    return canEnrich(user, this.settings);
  }

  shouldEnrich(msg) {
    return this.shouldLogic(msg, shouldEnrich, "enrich");
  }

  shouldReveal(msg) {
    return this.shouldLogic(msg, shouldReveal, "reveal");
  }

  shouldProspect(msg) {
    return this.shouldLogic(msg, shouldProspect, "prospect");
  }

  shouldLogic(msg, action) {
    if (!this.client) return { should: false, message: "no api_key set" };
    return action(msg, this.settings);
  }

  enrichUser(user) {
    const asUser = this.hull.asUser(
      _.pick(user, ["id", "external_id", "email"])
    );
    const logError = error => {
      asUser.logger.info("outgoing.user.error", {
        errors: error,
        method: "enrichUser"
      });
    };
    return enrichUser(user, this)
      .then(response => {
        if (!response || !response.source) return false;
        const { person, source } = response;
        return this.saveUser(user, person, { source });
      }, logError)
      .catch(logError);
  }

  revealUser(user = {}) {
    const asUser = this.hull.asUser(
      _.pick(user, ["id", "external_id", "email"])
    );
    const { last_known_ip } = user;
    const logError = error => {
      // we filter error messages
      if (!_.includes(FILTERED_ERRORS, error.type)) {
        asUser.logger.info("outgoing.user.error", {
          errors: error,
          method: "revealUser"
        });
      }
    };
    return revealUser(user, this)
      .then(response => {
        if (!response || !response.source) return false;
        const { person = {}, source } = response;
        const { company } = person;
        return this.saveUser(user, person, {
          source,
          company: _.pick(company, "name", "domain"),
          ip: last_known_ip
        });
      }, logError)
      .catch(logError);
  }

  prospectUser(user, account = {}) {
    const { prospect_domain = "domain" } = this.settings;
    const domain = getDomain(user, account, prospect_domain);

    if (!domain) return false;

    const asUser = this.hull.asUser(user);
    // const asAccount = this.hull.asAccount(account);
    const logError = error => {
      asUser.logger.info("outgoing.user.error", {
        errors: _.get(error, "message", error),
        method: "prospectUser"
      });
    };

    // Since user update logic is synchronous,
    // There is a second, asynchronous part of checks in here.
    return shouldprospectUserFromDomain({
      domain,
      hull: this.hull,
      settings: this.settings
    })
      .then(({ should, reason }) => {
        if (!should) {
          this.logSkip(asUser, "prospector", reason);
          // asUser.track( "Clearbit Prospector Triggered", { action: "skipped", reason }, { ip: 0 } );
          return false;
        }
        return this.prospect(user, account, domain);
      })
      .catch(logError);
  }

  prospect(user, account, domain) {
    const query = {
      domain,
      limit: this.settings.prospect_limit_count,
      email: true
    };

    ["seniority", "titles", "role"].forEach(k => {
      const filter = this.settings[`prospect_filter_${k}`];
      if (!_.isEmpty(filter)) {
        query[k] = filter;
      }
    });

    const company_traits = _.reduce(
      user,
      (traits, val, k) => {
        const [group, key] = k.split("/");
        if (group === "traits_clearbit_company") {
          traits[`clearbit_company/${key}`] = val;
        }
        return traits;
      },
      {}
    );
    return this.fetchProspects({
      query,
      company_traits,
      user,
      account
    });
  }

  fetchProspects({ query = {}, company_traits = {}, user = {}, account }) {
    const { titles = [], domain, role, seniority, limit = 5 } = query;

    const asUser = user.id ? this.hull.asUser(user) : this.hull;
    // Allow prospecting even if no titles passed
    if (titles.length === 0) titles.push(null);

    const prospects = {};

    return Promise.mapSeries(titles, title => {
      const newLimit = limit - _.size(prospects);
      if (newLimit <= 0) return Promise.resolve(prospects);
      const params = {
        domain,
        role,
        seniority,
        title,
        limit: newLimit,
        email: true
      };
      return this.client.prospect(params, asUser).then((results = []) => {
        results.forEach(p => {
          prospects[p.email] = p;
        });
      });
    })
      .then(() => {
        const response = _.values(prospects);
        const log = {
          source: "prospector",
          message: `Found ${response.length} new Prospects`,
          ...query,
          company_traits,
          prospects: response
        };
        asUser.logger.info("outgoing.user.success", log);

        // If we're scoped as Hull (and not as a User)
        // - when coming from the Prospector UI, then we can't add Track & Traits.
        if (asUser.track && asUser.traits) {
          asUser.track(
            "Clearbit Prospector Triggered",
            {
              ..._.mapKeys(query, (v, k) => `query_${k}`),
              found: response.length,
              emails: _.keys(prospects)
            },
            { ip: 0 }
          );
          asUser.traits(
            { prospected_at: { value: now(), operation: "setIfNull" } },
            { source: "clearbit" }
          );
        }
        return response;
      })
      .then(response =>
        Promise.all(
          response.map(p => this.saveProspect(user, account, company_traits, p))
        )
      );
  }

  /** *********************************************************
   * Clearbit Discovery
   */

  /**
   * Check if we should fetch similar companies from clearbit (based on user data and ship configuration)
   * @param  {Message({ user, segments })} message - A user:update message
   * @return {Boolean}
   */
  shouldDiscover({ segments = [], user = {}, account = {} }) {
    const {
      discover_enabled,
      discover_segments = [],
      discover_domain = "domain"
    } =
      this.settings || {};
    const domain = getDomain(user, account, discover_domain);

    if (!this.client || !discover_enabled) {
      return { should: false, message: "discover not enabled" };
    }

    if (_.isEmpty(discover_segments)) {
      return { should: false, message: "No segments defined in Discover" };
    }

    if (!domain) {
      return {
        should: false,
        message: "No 'domain' in User nor account. We need a domain"
      };
    }

    if (user["traits_clearbit/discovered_similar_companies_at"]) {
      return { should: false, message: "Already discovered similar companies" };
    }

    if (!user.last_seen_at || !user.email) {
      return { should: false, message: "User has no email or no last_seen_at" };
    }

    if (user["traits_clearbit/discovered_from_domain"]) {
      return {
        should: false,
        message: "User is himself a discovery. Prevent Loops"
      };
    }

    if (!isInSegments(segments, discover_segments)) {
      return {
        should: false,
        message: "User is not in a discoverable segment"
      };
    }

    return { should: true };
  }

  /**
   * Find companies similar to a given company
   * @param  {Company} domain - A company domain name
   * @param  {Object} filters - Criteria to use as filters
   * @return {Promise}
   */
  discoverSimilarCompanies(user) {
    // TODO -> Support Accounts
    const domain = getDomain(user);
    if (!domain) return Promise.resolve([]);
    const limit = this.settings.discover_limit_count;
    const query = { similar: domain };

    // Let's not call the Discovery API if we have already done it before...
    return this.companiesDiscoveredFromDomain(domain)
      .then(({ pagination }) => {
        if (pagination && pagination.total > 0) {
          this.hull.logger.debug("domain.discover.skip", {
            reason: "domain already used for discovery !",
            domain
          });
          return false;
        }

        return this.client
          .discover({ query, limit })
          .then(({ results = [] }) => {
            const discovered_similar_companies_at =
              user["traits_clearbit/discovered_similar_companies_at"];
            if (user.id && !discovered_similar_companies_at) {
              this.hull.asUser(user.id).traits(
                {
                  discovered_similar_companies_at: now()
                },
                { source: "clearbit", sync: true }
              );
            }

            return this.saveDiscoveredCompanies(results, domain);
          });
      })
      .catch(error => {
        this.hull
          .asUser(_.pick(user, ["id", "external_id", "email"]))
          .logger.info("outgoing.user.error", {
            errors: _.get(error, "message", error)
          });
      });
  }

  companiesDiscoveredFromDomain(domain) {
    // TODO -> Support Accounts
    const query = {
      term: { "traits_clearbit/discovered_from_domain.exact": domain }
    };
    return this.hull.post("search/user_reports", { query });
  }

  saveDiscoveredCompanies(companies = [], discovered_from_domain) {
    // TODO -> Support Accounts
    return Promise.all(
      companies.map(company => {
        const person = { company };
        // TODO: save account instead of user
        const traits = getUserTraitsFromPerson({ person });
        traits["clearbit/discovered_from_domain"] = {
          value: discovered_from_domain,
          operation: "setIfNull"
        };
        traits["clearbit/discovered_at"] = {
          value: now(),
          operation: "setIfNull"
        };
        traits["clearbit/source"] = {
          value: "discover",
          operation: "setIfNull"
        };
        return this.hull
          .asUser({ anonymous_id: `clearbit-company:${company.id}` })
          .traits(traits)
          .then(() => traits);
      })
    );
  }

  /**
   * Save traits on Hull user
   * @param  {Object} user - Hull User object
   * @param  {Object} person - Clearbit Person object
   * @return {Promise -> Object({ user, person })}
   */
  saveUser(user = {}, person = {}, options = {}) {
    // const { id, external_id } = user;
    // const email = user.email || person.email;
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

    const traits = getUserTraitsFromPerson({ user, person }, "Person");

    traits["clearbit/fetched_at"] = { value: now(), operation: "setIfNull" };

    if (source) {
      traits[`clearbit/${source}ed_at`] = {
        value: now(),
        operation: "setIfNull"
      };
      traits["clearbit/source"] = { value: source, operation: "setIfNull" };
    }

    this.metric(`ship.${direction}.users`, 1, ["saveUser"]);

    const promises = [];

    if (this.settings.handle_accounts) {
      const all_traits = { user: {}, account: {} };

      _.map(
        traits,
        (v, k) => {
          const [group, trait] = k.split("/");
          if (group === "clearbit_company") {
            all_traits.account[`clearbit/${trait}`] = v;
          } else {
            all_traits.user[k] = v;
          }
        },
        {}
      );

      const domain = all_traits.account["clearbit/domain"];

      // Set top level traits
      const top_level_traits = {
        name: "name",
        domain: "domain"
      };
      _.forIn(top_level_traits, (clearbit_name, top_level_name) => {
        const value = all_traits.account[`clearbit/${clearbit_name}`];
        if (value) {
          _.set(all_traits.account, top_level_name, {
            value,
            operation: "setIfNull"
          });
        }
      });

      promises.push(asUser.traits(all_traits.user));

      if (domain) {
        const asAccount = asUser.account({ domain });
        asAccount.logger.info(`${direction}.account.success`, {
          source,
          traits: all_traits.account
        });
        promises.push(asAccount.traits(all_traits.account));
      }
    } else {
      promises.push(asUser.traits(traits));
    }

    return Promise.all(promises).then(() => {
      asUser.logger.info(`${direction}.user.success`, { ...options, traits });
      return { traits, user, person };
    });
  }

  /**
   * Create a new user on Hull from a discovered Prospect
   * @param  {Object({ person })} payload - Clearbit/Person object
   * @return {Promise -> Object({ person })}
   */
  saveProspect(user = {}, account = {}, company_traits, person = {}) {
    const traits = getUserTraitsFromPerson({ person }, "Prospect");
    const attribution = {
      "clearbit/prospected_at": { operation: "setIfNull", value: now() },
      "clearbit/source": { operation: "setIfNull", value: "prospector" },
      ...(user.id && {
        "clearbit/prospected_from": {
          operation: "setIfNull",
          value: user.id
        }
      })
    };
    // as a new user
    const hullUser = this.hull.asUser({
      email: person.email,
      anonymous_id: `clearbit-prospect:${person.id}`
    });

    this.metric("ship.incoming.users", 1, ["prospect"]);
    hullUser.logger.info("incoming.user.success", {
      personId: _.pick(person, "id"),
      source: "prospector"
    });

    if (!this.settings.handle_accounts) {
      return hullUser
        .traits({ ...company_traits, ...traits, ...attribution })
        .then(() => person);
    }

    hullUser.traits({ ...traits, ...attribution });

    const company = _.mapKeys(company_traits, (v, k) =>
      k.replace("clearbit_company/", "clearbit/")
    );

    // as the existing account
    const hullAccount = hullUser.account(account);

    hullAccount.logger.info("incoming.account.success", {
      person,
      source: "prospector"
    });

    const domain = company_traits["clearbit_company/domain"];
    return hullAccount
      .traits({
        ...company,
        ...attribution,
        ...(domain && { domain: { operation: "setIfNull", value: domain } })
      })
      .then(() => person);
  }
}
