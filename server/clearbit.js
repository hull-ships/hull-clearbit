import { Client } from "clearbit";
import moment from "moment";
import _ from "lodash";
import Promise from "bluebird";
import ObjectMapper from "object-mapper";
import Mappings from "./clearbit-mapping";
import DOMAINS from "./domains";
import jwt from "jwt-simple";

export default class Clearbit {

  constructor({ hull, ship, stream = false, forceFetch = false, hostSecret }) {
    this.ship = ship;
    const { api_key } = ship.private_settings;
    this.settings = {
      ...ship.private_settings,
      hostSecret,
      forceFetch,
      stream
    };
    this.client = new Client({ key: api_key });
    this.hull = hull;
  }

  // NotifHandler
  static handleUserUpdate(options = {}) {
    return ({ message }, { hull, ship }) => {
      const clearbit = new Clearbit({
        hull, ship,
        hostSecret: options.hostSecret,
        stream: false
      });
      return clearbit.handleUserUpdate(message);
    };
  }

  handleUserUpdate(message = {}) {
    // Stop right here if we do not match filters
    if (!this.shouldEnrich(message)) return false;

    return this.enrichUser(message.user).then(
      ({ person }) => {
        if (this.shouldProspect(message)) {
          return this.findSimilarPersons(
            person,
            this.getFilterProspectOptions()
          );
        }
        return person;
      }
    );
  }

  // Handle Webhooks
  static handleWebhook({ hostSecret }) {
    return (req, res) => {
      const { status, type, body } = req.body;
      const { client: hull, ship } = req.hull;
      const user = { id: req.hull.config.userId };

      if (type === "person" && status === 200 && user.id) {
        const person = body;
        const clearbit = new Clearbit({
          hull, ship,
          hostSecret
        });

        Promise.all([
          hull.get(`${user.id}/user_report`),
          hull.get(`${user.id}/segments`),
          clearbit.saveUser({ user, person })
        ])
        .then(([user, segments]) => {
          if (clearbit.shouldProspect({ user, segments })) {
            clearbit.findSimilarPersons(
              person,
              clearbit.getFilterProspectOptions()
            );
          }
          res.json({ message: "thanks" });
        })
        .catch(error => {
          res.status(error.status || 500).json({
            error: error.message
          });
        });
      } else {
        res.json({ message: "ignored" });
      }
    };
  }


  // BatchHandler
  static handleBatchUpdate() {
    return (messages = [], { hull, ship }) => {
      const clearbit = new Clearbit({
        hull, ship,
        stream: true,
        forceFetch: true
      });
      return messages.map(
        m => clearbit.handleUserUpdate(m.message)
      );
    };
  }

  // Checks if the email's domain is in the excluded email domains list
  isEmailDomainExcluded(email = "") {
    this.log("isEmailDomainExcluded");
    const excluded_domains = DOMAINS.concat(
      this.settings.excluded_domains || []
    ).map((d = "") => d.toLowerCase().trim());
    const domain = (email || "").split("@")[1];
    return domain && _.includes(excluded_domains, domain);
  }

  // Check if a user belongs to one of the segments listed
  isInSegments(userSegments = [], segmentsListIds = []) {
    this.log("isInSegments");
    return _.isEmpty(segmentsListIds) || _.intersection(
      userSegments.map(({ id }) => id),
      segmentsListIds
    ).length > 0;
  }

  lookupIsPending(user) {
    const fetched_at = user["traits_clearbit/fetched_at"];
    const cbId = user["traits_clearbit/id"];
    const one_hour_ago = moment().subtract(1, "hours");
    return fetched_at && moment(fetched_at).isAfter(one_hour_ago) && !cbId;
  }

  canEnrich(message = {}) {
    const { user, segments = [] } = message;
    const {
      enrich_segments = [],
      prospect_segments = []
    } = this.settings;

    // Merge enrich and prospect segments lists
    // To check if the user matches one of them
    const filterSegments = enrich_segments.length && enrich_segments.concat(prospect_segments);

    const checks = {
      emptyEmail: !_.isEmpty(user.email),
      domain: !this.isEmailDomainExcluded(user.email),
      inSegment: this.isInSegments(segments, filterSegments)
    };

    return _.every(checks);
  }

  shouldEnrich(message = {}) {
    const { user = {} } = message;

    // Stop here if we cannot fetch him
    if (!this.canEnrich(message)) return false;

    // Force fetch even if we already have the data
    if (this.settings.forceFetch) return true;

    // Skip if we are waiting for the webhook
    if (this.lookupIsPending(user)) return false;

    const cbId = user['traits_clearbit/id'];
    const fetched_at = user['traits_clearbit/fetched_at'];

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

  shouldProspect({ user = {},  segments = [] }) {
    return this.settings.enable_prospect && this.isInSegments(
      segments,
      this.settings.prospect_segments
    );
  }

  log(msg, data = "") {
    this.hull.utils.log(msg, data);
  }

  getFilterProspectOptions() {
    return [
      "prospect_role",
      "prospect_seniority",
      "prospect_titles"
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

  saveUser({ user = {}, person = {} }) {
    let ident = user.id;
    if (!ident && user.external_id) {
      ident = { external_id: user.external_id };
    }

    if (!ident && user.email) {
      ident = { email: user.email };
    }

    if (!ident) {
      const error = new Error("Missing identifier for user");
      error.status = 400;
      return Promise.reject(error);
    }

    const traits = this.getUserTraitsFromPerson(
      { user, person },
      Mappings.Person
    );

    traits["clearbit/fetched_at"] = new Date().toISOString();

    return this.hull
      .as(user.id || { email: user.email })
      .traits(traits)
      .then(() => { return { user, person }; });
  }

  saveProspect(person = {}) {
    const traits = this.getUserTraitsFromPerson({ person }, Mappings.Prospect);
    traits["clearbit/prospected_at"] = new Date().toISOString();
    this.log("saveProspect", { email: person.email, traits });
    this.hull
      .as({ email: person.email })
      .traits(traits)
      .then(() => { return { person }; });
  }

  getWebhookId(userId) {
    const { id, secret, organization } = this.hull.configuration();
    const claims = { ship: id, secret, organization, userId };
    return jwt.encode(claims, this.settings.hostSecret);
  }

  enrichUser(user = {}) {
    const touchUser = this.saveUser.bind(this, { user });

    const payload = {
      email: user.email,
      given_name: user.first_name,
      family_name: user.last_name,
      subscribe: true,
      stream: this.settings.stream
    };

    if (this.settings.stream) {
      payload.stream = true;
    } else {
      payload.webhook_id = this.getWebhookId(user.id);
    }

    this.log("enrichUser", payload);

    const { Person } = this.client;

    return Person.find(payload)
      .then(person => this.saveUser({ user, person }))
      .catch(Person.QueuedError, touchUser)
      .catch(Person.NotFoundError, touchUser);
  }

  findSimilarPersons(person = {}, options = {}) {
    const { domain } = person.employment || {};
    this.log("findSimilarPersons", { domain, options });
    return this.discoverSimilarCompanies(domain, options.company)
      .then((companies = []) => {
        console.warn(`>> Found ${companies.length} companies !`);

        return Promise.all(companies.map(company =>
          this.fetchProspectsFromCompany(company, options.prospect)
        ));
      }).catch(err => console.warn("Boom clearbit error", err));
  }

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

  discoverSimilarCompanies(similar, filters = {}) {
    const limit = this.settings.limit_companies;
    const query = { ...filters, similar };
    this.log("discoverSimilarCompanies: ", { query, limit });
    const search = similar ? this.client.Discovery.search({ query, limit }) : Promise.resolve({ results: [] });
    return search.then(response => response.results);
  }

}
