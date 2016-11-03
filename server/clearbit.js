import { Client } from "clearbit";
import moment from "moment";
import _ from "lodash";
import Promise from "bluebird";
import ObjectMapper from "object-mapper";
import Mappings from "./clearbit-mapping";
import DOMAINS from "./domains";
import jwt from "jwt-simple";

export default class Clearbit {

  constructor({ hull, ship, stream = false, forceFetch = false, hostSecret, onMetric, hostname }) {
    this.ship = ship;
    const { api_key } = ship.private_settings;
    this.settings = {
      ...ship.private_settings,
      hostSecret,
      forceFetch,
      stream
    };
    this.hull = hull;
    this.hostname = hostname;
    this.onMetric = onMetric;
    if (api_key) {
      this.client = new Client({ key: api_key });
    }
  }

  log(msg, data = "") {
    this.hull.logger.info(msg, data);
  }

  metric(metric, value = 1) {
    if (_.isFunction(this.onMetric)) {
      this.onMetric(metric, value, { id: this.ship.id });
    }
  }

  /** *********************************************************
   * Clearbit Enrichment
   */

  /**
   * Checks if the email's domain is in the excluded email domains list
   * @param  {String} email - An email address
   * @return {Boolean}
   */
  isEmailDomainExcluded(email = "") {
    this.log("isEmailDomainExcluded");
    const excluded_domains = DOMAINS.concat(
      this.settings.excluded_domains || []
    ).map((d = "") => d.toLowerCase().trim());
    const domain = (email || "").split("@")[1];
    return domain && _.includes(excluded_domains, domain);
  }

  /**
   * Check if a user belongs to one of the segments listed
   * @param  {Array<Segment>} userSegments - A list of segments
   * @param  {Array<ObjectId>} segmentsListIds - A list of segment ids
   * @return {Boolean}
   */
  isInSegments(userSegments = [], segmentsListIds = []) {
    this.log("isInSegments");
    return _.isEmpty(segmentsListIds) || _.intersection(
      userSegments.map(({ id }) => id),
      segmentsListIds
    ).length > 0;
  }

  /**
   * Check an enrich call has been made in the last hour
   * and we are still waiting for the webhook to ping us
   * @param  {User} user - A User
   * @return {Boolean}
   */
  lookupIsPending(user) {
    const fetched_at = user["traits_clearbit/fetched_at"];
    const cbId = user["traits_clearbit/id"];
    const one_hour_ago = moment().subtract(1, "hours");
    return fetched_at && moment(fetched_at).isAfter(one_hour_ago) && !cbId;
  }


  /**
   * Check if we can Enrich the User (based on user data and ship configuration)
   * @param  {Message({ user, segments })} message - A user:update message
   * @return {Boolean}
   */
  canEnrich(message = {}) {
    const { user, segments = [] } = message;
    const {
      enrich_segments = [],
      prospect_segments = [],
      enable_reveal
    } = this.settings;

    // Merge enrich and prospect segments lists
    // To check if the user matches one of them
    const filterSegments = enrich_segments.length && enrich_segments.concat(prospect_segments);
    const hasEmail = !_.isEmpty(user.email);
    const canReveal = !!enable_reveal && user.last_known_ip;


    const checks = {
      emailOrReveal: hasEmail || canReveal,
      inSegment: this.isInSegments(segments, filterSegments)
    };

    return _.every(checks);
  }

  /**
   * Check if we should Enrich the User (based on user data and ship configuration)
   * @param  {Message({ user, segments })} message - A user:update message
   * @return {Boolean}
   */
  shouldEnrich(message = {}) {
    const { user = {} } = message;

    if (!this.client) return false;

    // Stop here if we cannot fetch him
    if (!this.canEnrich(message)) return false;

    // Force fetch even if we already have the data
    if (this.settings.forceFetch) return true;

    // Skip if we are waiting for the webhook
    if (this.lookupIsPending(user)) return false;

    const cbId = user["traits_clearbit/id"];
    const fetched_at = user["traits_clearbit/fetched_at"];

    // Enrich if we have no clearbit data
    if (!cbId || !fetched_at) return true;

    // Enrich again and prospect if the user
    // just entered in one of the segments to prospect
    const entered = _.get(message, "changes.segments.entered", false);

    return this.settings.enable_prospect
      && entered
      && this.isInSegments(
        entered,
        this.settings.prospect_segments
      );
  }

  /**
   * Builds the list of traits to apply on the user
   * from data pulled from Clearbit
   * @param  {Object({ user, person })} payload - Hull/User and Clearbit/Person objects
   * @param  {mappings} mappings - mappings to user
   * @return {Object}
   */
  getUserTraitsFromPerson({ user = {}, person = {} }, mappings) {
    const mapping = _.reduce(mappings, (map, key, val) => {
      return Object.assign(map, {
        [val]: {
          key,
          transform: (v) => {
            // Replace the key to build an accessor compatible with lodash's _.get
            // address.city -> address_city
            // name -> name
            // clearbit/foo -> clearbit.foo
            const accessor = key.replace(".", "_").replace("/", ".");
            const userVal = _.get(user, accessor);

            // Return early is undefined
            if (_.isUndefined(v)) return undefined;

            // Only return the value if :
            // - it's a user property and it's undefined
            if (_.isUndefined(userVal)) return v;

            // - it's a clearbit trait and it has changed
            if (key.match(/^clearbit/) && userVal !== v) {
              return v;
            }

            return undefined;
          }
        }
      });
    }, {});

    const traits = ObjectMapper.merge(person, {}, mapping);

    return traits;
  }

  getMapping(key) {
    const companyMapping = this.settings.enrich_with_company || this.settings.enable_reveal ? Mappings.Company : {};
    return {
      ...companyMapping,
      ...Mappings[key]
    };
  }

  /**
   * Save traits on Hull user
   * @param  {Object} user - Hull User object
   * @param  {Object} person - Clearbit Person object
   * @return {Promise -> Object({ user, person })}
   */
  saveUser(user = {}, person = {}) {
    let ident = user.id;
    const email = user.email || person.email;

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

    const traits = this.getUserTraitsFromPerson(
      { user, person },
      this.getMapping("Person")
    );

    traits["clearbit/fetched_at"] = new Date().toISOString();

    this.metric("user.save");

    return this.hull
      .as(ident)
      .traits(traits)
      .then(() => { return { user, person }; });
  }


  /**
   * Build context to pass a webhook_id
   * @param  {String} userId - Hull User id
   * @return {String}
   */
  getWebhookId(userId) {
    const { hostSecret } = this.settings;
    const { id, secret, organization } = this.hull.configuration();
    const claims = { ship: id, secret, organization, userId };
    return hostSecret && jwt.encode(claims, hostSecret);
  }

  enrichUser(user = {}) {
    if (!user) {
      return Promise.reject(new Error("Empty user"));
    }

    if (user.email) {
      return this.fetchFromEnrich(user);
    }

    if (user.last_known_ip && this.settings.enable_reveal) {
      return this.fetchFromReveal(user);
    }

    return Promise.reject(new Error(`Cannot enrich user ${user.id}`));
  }

  /**
   * Lookup data from Clearbit's Reveal API and save it as
   * traits on the Hull user
   * @param  {User} user - Hull User
   * @return {Promise -> Object({ user, person })}
   */
  fetchFromReveal(user = {}) {
    const { Reveal } = this.client;
    const ip = user.last_known_ip;
    return Reveal.find({ ip }).then((response = {}) => {
      const { company } = response;
      return this.saveUser(user, { company });
    }).catch(({ message, statusCode }) => {
      this.hull.logger.warn("Cannot Reveal IP", { ip, message, statusCode });
    });
  }


  /**
   * Fetch data from Clearbit's Enrichment API and save it as
   * traits on the Hull user
   * @param  {User} user - Hull User
   * @return {Promise -> Object({ user, person })}
   */
  fetchFromEnrich(user = {}) {
    const saveUser = this.saveUser.bind(this, user);

    const payload = {
      email: user.email,
      given_name: user.first_name,
      family_name: user.last_name,
      stream: this.settings.stream
    };

    if (this.settings.stream) {
      payload.stream = true;
    } else {
      payload.webhook_id = this.getWebhookId(user.id);
    }

    if (this.hostname) {
      payload.webhook_url = `https://${this.hostname}/clearbit?ship=${this.ship.id}&id=${this.getWebhookId(user.id)}`;
    }

    this.log("enrichUser", payload);
    this.metric("user.enrich");

    const { Enrichment } = this.client;

    return Enrichment.find(payload)
      .then(({ person = {}, company = {} }) => {
        return { ...person, company };
      })
      .then(saveUser)
      .catch(
        Enrichment.QueuedError,
        Enrichment.NotFoundError,
        () => saveUser()
      )
      .catch((err = {}) => {
        const { message } = err;
        this.hull.logger.warn(`clearbit error for ${user.email}: ${message}`);
      });
  }


  /** *********************************************************
   * Clearbit Prospection
   */

  propectorEnabled() {
    return !!(this.client && this.settings.enable_prospect);
  }

  /**
   * Check if we should fetch similar users from clearbit (based on user data and ship configuration)
   * @param  {Message({ user, segments })} message - A user:update message
   * @return {Boolean}
   */
  shouldProspect({ segments = [] }) {
    if (!this.client) return false;
    return this.settings.enable_prospect
      && this.isInSegments(
        segments,
        this.settings.prospect_segments
      );
  }

  /**
   * Builds the objects to use as filters in the
   * Discovery and Prospector APIs
   * @return {Object}
   */
  getFilterProspectOptions() {
    return [
      "prospect_role",
      "prospect_seniority"
    ].reduce((opts, k) => {
      const [cat, key] = k.split("_");
      const val = this.settings[k];
      if (!_.isEmpty(val)) {
        opts[cat] = opts[cat] || {};
        opts[cat][key] = val;
      }
      return opts;
    }, { prospect: {}, company: {} });
  }

  /**
   * Find persons similar to a giver Clearbit Person
   * fetches companies via the Discovery API
   * then people from the Prospector APi
   * @param  {Person} person - A Clearbit Person
   * @param  {Object} options - Options
   * @return {Promise}
   */
  findSimilarPersons(person = {}, options = {}) {
    const { domain } = person.employment || {};
    this.log("findSimilarPersons", { domain, options });
    this.metric("prospect.discover");
    return this.discoverSimilarCompanies(domain, options.company)
      .then((companies = []) => {
        return Promise.all(companies.map(company =>
          this.fetchProspectsFromCompany(company, options.prospect)
        ));
      }).catch(err => console.warn("clearbit error", err && err.message));
  }

  /**
   * Create a new user on Hull from a discrovered Prospect
   * @param  {Object({ person })} payload - Clearbit/Person object
   * @return {Promise -> Object({ person })}
   */
  saveProspect(person = {}) {
    const traits = this.getUserTraitsFromPerson({ person }, this.getMapping("Prospect"));
    traits["clearbit/prospected_at"] = new Date().toISOString();
    this.log("saveProspect", { email: person.email, traits });
    this.metric("prospect.save");
    this.hull
      .as({ email: person.email })
      .traits(traits)
      .then(() => { return { person }; });
  }

  /**
   * Find companies similar to a given company
   * @param  {Company} domain - A company domain name
   * @param  {Object} filters - Criteria to use as filters
   * @return {Promise}
   */
  discoverSimilarCompanies(domain, filters = {}) {
    const limit = this.settings.limit_companies;
    const query = { ...filters, similar: domain };
    this.log("discoverSimilarCompanies: ", { query, limit });
    const search = domain ? this.client.Discovery.search({ query, limit }) : Promise.resolve({ results: [] });
    return search.then(response => response.results);
  }

  /**
   * Find matching some criteria with a given company
   * @param  {Company} company - A Clearbit Company
   * @param  {Object} filters - Criteria to use as filters
   * @return {Promise}
   */
  fetchProspectsFromCompany(company = {}, { role, seniority, titles }) {
    const limit = this.settings.limit_prospects;
    const { domain } = company;
    const query = {
      domain,
      seniority,
      role,
      titles,
      limit,
      email: true
    };

    this.log("fetchProspectsFromCompany", { domain, seniority, role });

    this.client.Prospector.search(query)
      .then((people) => {
        this.log(`++ found ${people.length} Prospects for `, query);
        people.map(prospect => {
          this.log(">> foundProspect", prospect);
          prospect.company = company;
          return Promise.all([
            this.saveProspect(prospect),
            this.enrichUser({ email: prospect.email })
          ]);
        });
      });
  }


}
