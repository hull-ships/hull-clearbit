import _ from "lodash";
import Promise from "bluebird";

import Client from "./clearbit/client";

import { isInSegments, getDomain, now } from "./clearbit/utils";
import { canProspect, shouldProspect, shouldProspectUsersFromDomain } from "./clearbit/prospect";
import { canEnrich, shouldEnrich, enrichUser } from "./clearbit/enrich";
import { canReveal, shouldReveal, revealUser } from "./clearbit/reveal";
import getUserTraitsFromPerson from "./clearbit/mapping";

const FILTERED_ERRORS = ["unknown_ip"];

export default class Clearbit {
  constructor({
    hull, ship, stream = false, hostSecret, metric, hostname
  }) {
    this.ship = ship;

    if (!ship.private_settings) {
      console.error("MissingPrivateSettingsError", ship);
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
    asUser.logger.info("outgoing.user.skip", { reason, action, additionalData });
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

  shouldLogic(msg, action, actionString) {
    const { user = {} } = msg;
    if (!this.client) {
      this.logSkip(this.hull.asUser(user), actionString, "no api_key set");
      return false;
    }
    const { should, message } = action(msg, this.settings);
    if (should) return true;
    this.logSkip(this.hull.asUser(user), actionString, message);
    return false;
  }

  enrichUser(user) {
    const asUser = this.hull.asUser(_.pick(user, ["id", "external_id", "email"]));
    const logError = (error) => {
      asUser.logger.info("outgoing.user.error", { errors: error, method: "revealUser" });
    };
    return enrichUser(user, this)
      .then((response) => {
        if (!response || !response.source) return false;
        const { person, source } = response;
        return this.saveUser(user, person, { source });
      }, logError)
      .catch(logError);
  }

  revealUser(user = {}) {
    const asUser = this.hull.asUser(_.pick(user, ["id", "external_id", "email"]));
    const { last_known_ip } = user;
    const logError = (error) => {
      // we filter error messages
      if (!_.includes(FILTERED_ERRORS, error.type)) {
        asUser.logger.info("outgoing.user.error", { errors: error, method: "revealUser" });
      }
    };
    return revealUser(user, this)
      .then((response) => {
        if (!response || !response.source) return false;
        const { person = {}, source } = response;
        const { company } = person;
        asUser.logger.info("outgoing.user.success", {
          ip: last_known_ip,
          company: _.pick(company, "name", "domain")
        });
        return this.saveUser(user, person, { source });
      }, logError)
      .catch(logError);
  }

  /**
   * Save traits on Hull user
   * @param  {Object} user - Hull User object
   * @param  {Object} person - Clearbit Person object
   * @return {Promise -> Object({ user, person })}
   */
  saveUser(user = {}, person = {}, options = {}) {
    const { id, external_id } = user;
    const email = user.email || person.email;
    // const userIdent = { id, external_id, email };
    const { source } = options;

    // Custom Resolution strategy.
    // Only uses one identifier. [Why did we do this ?]
    let ident;
    if (id) {
      ident = {};
    } else if (external_id) {
      ident = { external_id };
    } else if (email) {
      ident = { email };
    }

    if (!ident) {
      const error = new Error("Missing identifier for user");
      error.status = 400;
      return Promise.reject(error);
    }

    const asUser = this.hull.asUser(ident);

    const traits = getUserTraitsFromPerson(
      { user, person },
      "Person"
    );

    traits["clearbit/fetched_at"] = { value: now(), operation: "setIfNull" };

    if (source) {
      traits[`clearbit/${source}ed_at`] = { value: now(), operation: "setIfNull" };
      traits["clearbit/source"] = { value: source, operation: "setIfNull" };
    }

    this.metric("ship.outgoing.users", 1, ["saveUser"]);


    const promises = [];

    if (this.settings.handle_accounts) {
      const all_traits = { user: {}, account: {} };

      _.map(traits, (v, k) => {
        const [group, trait] = k.split("/");
        if (group === "clearbit_company") {
          all_traits.account[`clearbit/${trait}`] = v;
        } else {
          all_traits.user[k] = v;
        }
      }, {});

      const domain = all_traits.account["clearbit/domain"];

      // Set top level traits
      const top_level_traits = {
        "name": "name",
        "domain": "domain",
      };
      _.forIn(top_level_traits, (clearbit_name, top_level_name) => {
        const value = all_traits.account[`clearbit/${clearbit_name}`];
        if (value) {
          _.set(all_traits.account, top_level_name, { value, operation: "setIfNull" });
        }
      });


      promises.push(asUser.traits(all_traits.user));
      asUser.logger.info("outgoing.user.success", { traits, source });

      if (domain) {
        const asAccount = asUser.account({ domain });
        asAccount.logger.info("outgoing.account.success", {
          source,
          traits: all_traits.account
        });
        promises.push(asAccount.traits(all_traits.account));
      }
    } else {
      asUser.logger.info("outgoing.user.success", { traits, source });
      promises.push(asUser.traits(traits));
    }

    return Promise.all(promises).then(() => { return { traits, user, person }; });
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
    } = this.settings || {};
    const domain = getDomain(user, account, discover_domain);

    const asUser = this.hull.asUser(user);

    if (!this.client || !discover_enabled || _.isEmpty(discover_segments)) {
      this.logSkip(asUser, "discover", "Discover not enabled", { discover_segments });
      return false;
    }

    if (!domain) {
      this.logSkip(asUser, "discover", "No 'domain' in User. We need a domain", { domain });
      return false;
    }

    if (user["traits_clearbit/discovered_similar_companies_at"]) {
      this.logSkip(asUser, "discover", "Already discovered similar companies");
      return false;
    }

    if (!user.last_seen_at || !user.email) {
      this.logSkip(asUser, "discover", "User has no email or no last_seen_at");
      return false;
    }

    if (user["traits_clearbit/discovered_from_domain"]) {
      this.logSkip(asUser, "discover", "User is himself a discovery. Prevent Loops");
      return false;
    }

    if (!isInSegments(segments, discover_segments)) {
      this.logSkip(asUser, "discover", "User is not in a discoverable segment", { discover_segments });
      return false;
    }

    return true;
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
    return this.companiesDiscoveredFromDomain(domain).then(({ pagination }) => {
      if (pagination && pagination.total > 0) {
        this.hull.logger.debug("domain.discover.skip", { reason: "domain already used for discovery !", domain });
        return false;
      }

      return this.client.discover({ query, limit }).then(({ results = [] }) => {
        const discovered_similar_companies_at = user["traits_clearbit/discovered_similar_companies_at"];
        if (user.id && !discovered_similar_companies_at) {
          this.hull.asUser(user.id).traits({
            discovered_similar_companies_at: now()
          }, { source: "clearbit", sync: true });
        }

        return this.saveDiscoveredCompanies(results, domain);
      });
    })
      .catch((error) => {
        this.hull.asUser(_.pick(user, ["id", "external_id", "email"]))
          .logger.info("outgoing.user.error", { errors: _.get(error, "message", error) });
      });
  }

  companiesDiscoveredFromDomain(domain) {
    // TODO -> Support Accounts
    const query = { term: { "traits_clearbit/discovered_from_domain.exact": domain } };
    return this.hull.post("search/user_reports", { query });
  }

  saveDiscoveredCompanies(companies = [], discovered_from_domain) {
    // TODO -> Support Accounts
    return Promise.all(companies.map((company) => {
      const person = { company };
      // TODO: save account instead of user
      const traits = getUserTraitsFromPerson({ person });
      traits["clearbit/discovered_from_domain"] = { value: discovered_from_domain, operation: "setIfNull" };
      traits["clearbit/discovered_at"] = { value: now(), operation: "setIfNull" };
      traits["clearbit/source"] = { value: "discover", operation: "setIfNull" };
      return this.hull.asUser({ anonymous_id: `clearbit-company:${company.id}` }).traits(traits).then(() => traits);
    }));
  }


  prospectUsers(user, account = {}) {
    const { prospect_domain = "domain" } = this.settings;
    const domain = getDomain(user, account, prospect_domain);

    if (!domain) return false;

    const asUser = this.hull.asUser(user);
    const asAccount = this.hull.asAccount({ domain });
    return shouldProspectUsersFromDomain({ domain, hull: this.hull, settings: this.settings })
      .then((doPropect) => {
        if (!doPropect) {
          this.logSkip(asUser, "prospector", "We already have known users with that domain");
          return false;
        }
        const query = {
          domain,
          limit: this.settings.prospect_limit_count,
          email: true
        };

        ["seniority", "titles", "role"].forEach((k) => {
          const filter = this.settings[`prospect_filter_${k}`];
          if (!_.isEmpty(filter)) {
            query[k] = filter;
          }
        });

        const company_traits = _.reduce(user, (traits, val, k) => {
          const [group, key] = k.split("/");
          if (group === "traits_clearbit_company") {
            traits[`clearbit_company/${key}`] = val;
          }
          return traits;
        }, {});

        return this.fetchProspects(query, company_traits, asUser, user, asAccount);
      })
      .catch((error) => {
        asUser.logger.info("outgoing.user.error", { errors: _.get(error, "message", error) });
      });
  }

  fetchProspects(query = {}, company_traits = {}, asUser, user, asAccount) {
    const {
      titles = [], domain, role, seniority, limit = 5
    } = query;

    // Allow prospecting even if no titles passed
    if (titles.length === 0) titles.push(null);

    const prospects = {};
    return Promise.mapSeries(titles, (title) => {
      const newLimit = limit - _.size(prospects);
      if (newLimit <= 0) return Promise.resolve(prospects);
      const params = {
        domain, role, seniority, title, limit: newLimit, email: true
      };
      return this.client
        .prospect(params, asUser)
        .then((results = []) => {
          results.forEach((p) => { prospects[p.email] = p; });
        });
    }).then(() => {
      const ret = _.values(prospects);
      const emails = _.keys(prospects);
      const log = {
        action: "prospector",
        message: `Found ${ret.length} new Prospects`,
        ...query,
        company_traits,
        ret
      };
      (asUser || this.hull).logger.info("outgoing.user.success", log);
      if (asAccount) {
        asAccount.logger.info("outgoing.account.success", log);
      }
      if (asUser) {
        const props = _.mapKeys(query, (v, k) => `query_${k}`);
        asUser.track("Clearbit Prospector Triggered", {
          ...props,
          found: ret.length,
          emails
        }, {
          ip: 0
        });
        asUser.traits({ prospected_at: { value: now(), operation: "setIfNull" } }, { source: "clearbit" });
        asAccount.traits({ prospected_at: { operation: "setIfNull", value: now() } }, { source: "clearbit" });
      }
      ret.map(this.saveProspect.bind(this, user, company_traits));
      return ret;
    });
  }

  /**
   * Create a new user on Hull from a discovered Prospect
   * @param  {Object({ person })} payload - Clearbit/Person object
   * @return {Promise -> Object({ person })}
   */
  saveProspect(user = {}, company_traits, person = {}) {
    const traits = getUserTraitsFromPerson({ person }, "Prospect");
    traits["clearbit/prospected_at"] = { operation: "setIfNull", value: now() };
    if (user.id) {
      traits["clearbit/prospected_from"] = { operation: "setIfNull", value: user.id };
    }
    traits["clearbit/source"] = { operation: "setIfNull", value: "prospect" };

    const hullUser = this.hull.asUser({ email: person.email, anonymous_id: `clearbit-prospect:${person.id}` });
    const domain = company_traits["clearbit_company/domain"];

    hullUser.logger.info("incoming.user.success", { person, source: "prospector" });
    this.metric("ship.incoming.users", 1, ["prospect"]);

    if (this.settings.handle_accounts && domain) {
      const company = _.reduce(company_traits, (m, v, k) => {
        m[k.replace("clearbit_company/", "clearbit/")] = v;
        return m;
      }, {});
      hullUser.account({ domain }).traits(company);
      return hullUser.traits({ ...traits }).then(() => ({ person }));
    }

    return hullUser.traits({ ...company_traits, ...traits }).then(() => ({ person }));
  }
}
