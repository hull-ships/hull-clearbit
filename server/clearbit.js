import _ from "lodash";
import Promise from "bluebird";

import Client from "./clearbit/client";

import { isInSegments, getDomain, now } from "./clearbit/utils";
import { shouldEnrich, enrichUser } from "./clearbit/enrich";
import { getUserTraitsFromPerson } from "./clearbit/mapping";

import excludes from "./excludes";


export default class Clearbit {

  constructor({ hull, ship, stream = false, hostSecret, onMetric, hostname }) {
    this.ship = ship;
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
      this.client = new Client(api_key, this.metric, this.log);
    }
  }

  log = (msg, data = "") => {
    this.hull.logger.info(msg, data);
  }

  debug = (msg, data = "") => {
    this.hull.logger.debug(msg, data);
  }


  /** *********************************************************
   * Clearbit Enrichment
   */

  shouldEnrich(message) {
    if (!this.client) return false;
    return shouldEnrich(message, this.settings);
  }

  enrichUser(user) {
    return enrichUser(user, this).then(
      ({ person, source }) => this.saveUser(user, person, { source })
    );
  }

  /**
   * Save traits on Hull user
   * @param  {Object} user - Hull User object
   * @param  {Object} person - Clearbit Person object
   * @return {Promise -> Object({ user, person })}
   */
  saveUser(user = {}, person = {}, options = {}) {
    let ident = user.id;
    const email = user.email || person.email;
    const { source } = options;

    if (!ident && user.external_id) {
      ident = { external_id: user.external_id };
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

    return this.hull
      .as(ident)
      .traits(traits)
      .then(() => { return { user, person }; });
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

    if (!this.client || !discover_enabled || _.isEmpty(discover_segments)) {
      this.debug("Discover not enabled", { discover_segments });
      return false;
    }

    if (!domain) {
      this.debug("We need a domain for discovery");
      return false;
    }

    if (user["traits_clearbit/discovered_similar_companies_at"]) {
      this.debug("Skip discovery: already discovered similar companies");
      return false;
    }

    if (!user.last_seen_at || !user.email) {
      this.debug("Skip discovery: never saw the guy - only discover real users");
      return false;
    }

    if (user["traits_clearbit/discovered_from_domain"]) {
      this.debug("Skip discovery: avoid discovery loop");
      return false;
    }

    if (!isInSegments(segments, discover_segments)) {
      this.debug("User is not in discoverable segment");
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
    const domain = getDomain(user);
    if (!domain) return Promise.resolve([]);
    const limit = this.settings.discover_limit_count;
    const query = { similar: domain };

    // Let's not call the Discovery API if we have already done it before...
    return this.companiesDiscoveredFromDomain(domain).then(({ pagination }) => {
      if (pagination && pagination.total > 0) {
        this.debug(`Skip discover Domain '${domain} already used for discovery !'`);
        return false;
      }

      return this.client.discover({ query, limit }).then(({ results = [] }) => {
        const discovered_similar_companies_at = user["traits_clearbit/discovered_similar_companies_at"];
        if (user.id && !discovered_similar_companies_at) {
          this.hull.as(user.id).traits({
            discovered_similar_companies_at: now()
          }, { source: "clearbit", sync: true });
        }

        return this.saveDiscoveredCompanies(results, domain);
      });
    });
  }

  companiesDiscoveredFromDomain(domain) {
    const query = { term: { "traits_clearbit/discovered_from_domain.exact": domain } };
    return this.hull.post("search/user_reports", { query });
  }

  saveDiscoveredCompanies(companies = [], discovered_from_domain) {
    return Promise.all(companies.map(company => {
      const person = { company };
      const traits = getUserTraitsFromPerson({ person });
      traits["clearbit/discovered_from_domain"] = { value: discovered_from_domain, operation: "setIfNull" };
      traits["clearbit/discovered_at"] = { value: now(), operation: "setIfNull" };
      traits["clearbit/source"] = { value: "discover", operation: "setIfNull" };
      return this.hull.as({ guest_id: `clearbit-company:${company.id}` }).traits(traits).then(() => traits);
    }));
  }

  /** *********************************************************
   * Clearbit Prospection
   */

  shouldProspect({ segments = [], user }) {
    const { prospect_segments, prospect_enabled } = this.settings;

    // We need a domain to prospect
    const domain = getDomain(user);

    if (!domain) {
      this.debug("Skip Prospect - unknown domain");
      return false;
    }

    if (!this.client || !prospect_enabled || _.isEmpty(prospect_segments)) {
      this.debug(`Skip Prospect ${domain} - disabled: `, { prospect_segments });
      return false;
    }

    // Only prospect anonymous users
    if (user.email) {
      this.debug(`Skip Prospect ${domain} - known user`, { email: user.email });
      return false;
    }

    // Don't prospect twice
    if (user["traits_clearbit/prospected_at"]) {
      this.debug(`Skip Prospect ${domain} - already prospected`);
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
          this.debug("Skip prospect - we already have known users with that domain");
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
        this.debug("Skip prospect - we already have known users with that domain");
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
    });
  }

  fetchProspects(query, company_traits = {}) {
    return this.client.prospect({ ...query, email: true }).then((prospects) => {
      this.debug(`Found ${prospects.length} new Prospects`);
      prospects.map(this.saveProspect.bind(this, company_traits));
      return prospects;
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

    this.debug("saveProspect", { email: person.email });
    this.metric("saveProspect");

    return this.hull
      .as({ email: person.email })
      .traits({ ...company_traits, ...traits })
      .then(() => { return { person }; });
  }

}
