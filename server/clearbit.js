import _ from "lodash";
import Promise from "bluebird";

import Client from "./clearbit/client";

import { isInSegments, getDomain, now } from "./clearbit/utils";
import { canEnrich, shouldEnrich, enrichUser } from "./clearbit/enrich";
import { canReveal, shouldReveal, revealUser } from "./clearbit/reveal";
import { getUserTraitsFromPerson } from "./clearbit/mapping";

import excludes from "./excludes";


export default class Clearbit {

  constructor({ hull, ship, stream = false, hostSecret, onMetric, hostname }) {
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

    this.metric = (metric, value = 1) => {
      if (_.isFunction(onMetric)) {
        onMetric(metric, value, { id: ship.id });
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

  canReveal(user) {
    return canReveal(user);
  }

  canEnrich(user) {
    return canEnrich(user);
  }

  shouldEnrich(msg) {
    return this.shouldLogic(msg, shouldEnrich, "enrich");
  }

  shouldReveal(msg) {
    return this.shouldLogic(msg, shouldReveal, "reveal");
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
    return enrichUser(user, this).then(
      (response) => {
        if (!response || !response.source) return false;
        const { person, source } = response;
        return this.saveUser(user, person, { source });
      }
    )
    .catch((error) => {
      this.hull.asUser(_.pick(user, ["id", "external_id", "email"]))
        .logger.info("outgoing.user.error", { errors: error, method: "enrichUser" });
    });
  }

  revealUser(user) {
    return revealUser(user, this).then(
      (response) => {
        if (!response || !response.source) return false;
        const { person, source } = response;
        return this.saveUser(user, person, { source });
      }
    )
    .catch((error) => {
      const filteredErrors = ["unknown_ip"];
      // we filter error messages
      if (!_.includes(filteredErrors, error.type)) {
        this.hull.asUser(_.pick(user, ["id", "external_id", "email"]))
          .logger.info("outgoing.user.error", { errors: error, method: "revealUser" });
      }
    });
  }

  /**
   * Save traits on Hull user
   * @param  {Object} user - Hull User object
   * @param  {Object} person - Clearbit Person object
   * @return {Promise -> Object({ user, person })}
   */
  saveUser(user = {}, person = {}, options = {}) {
    const { id, external_id } = user;
    let ident = id;
    const email = user.email || person.email;
    const userIdent = { id, external_id, email };
    const { source } = options;

    if (!ident && external_id) {
      ident = { external_id };
    }

    if (!ident && email) {
      ident = { email };
    }

    if (!ident) {
      const error = new Error("Missing identifier for user");
      error.status = 400;
      return Promise.reject(error);
    }

    const traits = getUserTraitsFromPerson(
      { user, person },
      "Person"
    );

    traits["clearbit/fetched_at"] = { value: now(), operation: "setIfNull" };

    if (source) {
      traits[`clearbit/${source}ed_at`] = { value: now(), operation: "setIfNull" };
      traits["clearbit/source"] = { value: source, operation: "setIfNull" };
    }

    this.metric("saveUser");
    this.hull.asUser(_.pick(userIdent, ["id", "external_id", "email"])).logger.info("incoming.user.success", { traits, source });

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

      const client = this.hull.asUser(ident);

      promises.push(client.traits(all_traits.user));

      if (domain) {
        promises.push(client.account({ domain }).traits(all_traits.account));
      }
    } else {
      promises.push(this.hull.asUser(ident).traits(traits));
    }

    return Promise.all(promises).then(() => { return { user, person }; });
  }


  /** *********************************************************
   * Clearbit Discovery
   */

  /**
   * Check if we should fetch similar companies from clearbit (based on user data and ship configuration)
   * @param  {Message({ user, segments })} message - A user:update message
   * @return {Boolean}
   */
  shouldDiscover({ segments = [], user = {} }) {
    const { discover_enabled, discover_segments = [] } = this.settings || {};
    const domain = getDomain(user);

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
    return Promise.all(companies.map(company => {
      const person = { company };
      // TODO: save account instead of user
      const traits = getUserTraitsFromPerson({ person });
      traits["clearbit/discovered_from_domain"] = { value: discovered_from_domain, operation: "setIfNull" };
      traits["clearbit/discovered_at"] = { value: now(), operation: "setIfNull" };
      traits["clearbit/source"] = { value: "discover", operation: "setIfNull" };
      return this.hull.asUser({ anonymous_id: `clearbit-company:${company.id}` }).traits(traits).then(() => traits);
    }));
  }

  /** *********************************************************
   * Clearbit Prospection
   */

  shouldProspect({ segments = [], user }) {
    const { prospect_segments, prospect_enabled } = this.settings;

    // We need a domain to prospect
    const domain = getDomain(user);
    const asUser = this.hull.asUser(user);

    if (!domain) {
      this.logSkip(asUser, "prospector", "No domain");
      return false;
    }

    if (!this.client || !prospect_enabled || _.isEmpty(prospect_segments)) {
      this.logSkip(asUser, "prospector", "Not in any prospectable segment", { domain, prospect_segments });
      return false;
    }

    // Only prospect anonymous users
    if (user.email) {
      this.logSkip(asUser, "prospector", "Known user. We only prospect unknown users");
      return false;
    }

    // Don't prospect twice
    if (user["traits_clearbit/prospected_at"]) {
      this.logSkip(asUser, "prospector", "Already prospected", { domain });
      return false;
    }

    return isInSegments(segments, prospect_segments);
  }


  /**
   * Check if we already have known users from that domain
   * or if we have enough revealed visitors to prospect
   * @param  {Object(user)} payload - Hull user object
   * @return {Promise -> Bool}
   */
  shouldProspectUsersFromDomain(domain) {
    if (_.includes(excludes.domains, domain)) {
      return Promise.resolve(false);
    }

    const query = { bool: {
      should: [
        { term: { "traits_clearbit_company/domain.exact": domain } },
        { term: { "domain.exact": domain } }
      ],
      minimum_should_match: 1
    } };

    const aggs = {
      without_email: { missing: { field: "email" } },
      by_source: { terms: { field: "traits_clearbit/source.exact" } }
    };

    const params = { query, aggs, search_type: "count" };

    return this.hull.post("search/user_reports", params).then(
      ({ pagination, aggregations }) => {
        const { total } = pagination;
        const anonymous = aggregations.without_email.doc_count;
        const bySource = _.reduce(aggregations.by_source.buckets, (bs, bkt) => {
          return { ...bs, [bkt.key]: bkt.doc_count };
        }, {});

        // Skip prospect if we have known users with that domain
        if (total > 0 && total !== anonymous) {
          return false;
        }

        // Prospect if at least one of those anonymous has been discovered
        if (bySource.discover && bySource.discover > 0) {
          return true;
        }

        const min_contacts = this.settings.reveal_prospect_min_contacts || 1;

        if (bySource.reveal && anonymous >= min_contacts) {
          return true;
        }

        return true;
      });
  }

  prospectUsers(user) {
    const { prospect_domain = "domain" } = this.settings;
    const domain = user[prospect_domain] || getDomain(user);

    if (!domain) return false;

    return this.shouldProspectUsersFromDomain(domain).then(doPropect => {
      if (!doPropect) {
        this.logSkip(this.hull.asUser(user), "prospector", "We already have known users with that domain");
        return false;
      }
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

      const company_traits = _.reduce(user, (traits, val, k) => {
        const [group, key] = k.split("/");
        if (group === "traits_clearbit_company") {
          traits[`clearbit_company/${key}`] = val;
        }
        return traits;
      }, {});

      return this.fetchProspects(query, company_traits);
    })
    .catch((error) => {
      this.hull.asUser(_.pick(user, ["id", "external_id", "email"]))
        .logger.info("outgoing.user.error", { errors: _.get(error, "message", error) });
    });
  }

  fetchProspects(query = {}, company_traits = {}) {
    const { titles = [], domain, role, seniority, limit = 5 } = query;

    // Allow prospecting even if no titles passed
    if (titles.length === 0) titles.push(null);

    const prospects = {};
    return Promise.mapSeries(titles, (title) => {
      const newLimit = limit - _.size(prospects);
      if (newLimit <= 0) return Promise.resolve(prospects);
      const params = { domain, role, seniority, title, limit: newLimit, email: true };
      return this.client
        .prospect(params)
        .then((results = []) => {
          results.forEach((p) => { prospects[p.email] = p; });
        });
    }).then(() => {
      const ret = _.values(prospects);
      this.hull.logger.info("clearbit.prospector.success", { action: "prospector", message: `Found ${ret.length} new Prospects`, company_traits, ret });
      ret.map(this.saveProspect.bind(this, company_traits));
      return ret;
    });
  }

  /**
   * Create a new user on Hull from a discovered Prospect
   * @param  {Object({ person })} payload - Clearbit/Person object
   * @return {Promise -> Object({ person })}
   */
  saveProspect(company_traits, person = {}) {
    const traits = getUserTraitsFromPerson({ person }, "Prospect");
    traits["clearbit/prospected_at"] = { operation: "setIfNull", value: now() };
    traits["clearbit/source"] = { operation: "setIfNull", value: "prospect" };

    this.hull.asUser(_.pick(person, ["id", "external_id", "email"])).logger.info("incoming.user.success", { person, source: "prospector" });
    this.metric("saveProspect");

    return this.hull
      .asUser({ email: person.email })
      .traits({ ...company_traits, ...traits })
      .then(() => { return { person }; });
  }

}
