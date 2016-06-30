import { Client } from "clearbit";
import moment from "moment";
import _ from "lodash";
import Promise from "bluebird";
import ObjectMapper from "object-mapper";
import Mappings from "./clearbit-mapping";
import DOMAINS from './domains';
import jwt from 'jwt-simple';

export default class Clearbit {

  constructor({ hull, ship, stream = false, hostSecret }) {
    this.ship = ship;
    const { api_key } = ship.private_settings;
    this.settings = {
      ...ship.private_settings,
      hostSecret,
      stream
    };
    this.client = new Client({ key: api_key });
    this.hull = hull;
  }

  static handleWebhook(req, res) {
    const { status, type, body } = req.body;
    const { client: hull, ship } = req.hull;
    if (type === 'person' && status === 200) {
      const configuration = hull.configuration();

      const user = { id: req.hull.config.userId };
      const person = body;
      const clearbit = new Clearbit({ hull, ship });

      clearbit.saveUser({ user, person }).then(
        () => res.json({ message: "thanks" }),
        (error) => res.status(500).json({ error })
      )

    } else {
      res.json({ message: 'ignored' });
    }
  }

  static handleUserUpdate(options = {}) {
    return ({ message }, { hull, ship, req }) => {
      const clearbit = new Clearbit({
        hull, ship,
        hostSecret: options.hostSecret,
        stream: false
      });
      return clearbit.handleUserUpdate(message);
    }
  }

  static handleBatchUpdate(options = {}) {
    return (messages = [], { hull, ship, req }) => {
      const clearbit = new Clearbit({ hull, ship, stream: true });
      return messages.map(
        m => clearbit.handleUserUpdate(m.message)
      );
    }
  }

  // Checks if the email's domain is in the excluded email domains list
  isEmailDomainExcluded(email = "") {
    this.log("isEmailDomainExcluded");
    const excluded_domains = DOMAINS.concat(
      this.settings.excluded_domains || []
    ).map((d = '') => d.toLowerCase().trim());
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

  alreadyHasFetchedData(user) {
    const fetched_at = user["traits_clearbit/fetched_at"];
    const cbId = user["traits_clearbit/id"];
    const one_hour_ago = moment().subtract(1, 'hours');
    return !!cbId;
  }

  shouldEnrich(message = {}) {
    const { user, segments = [] } = message;
    const {
      enrich_segments = [],
      prospect_segments = []
    } = this.settings;

    // Merge enrich and prospect segments lists
    // To check if the user matches one of them
    const filterSegments = enrich_segments.concat(prospect_segments);

    const shouldSkipEnrichment = _.isEmpty(user.email)
      || this.alreadyHasFetchedData(user)
      || this.isEmailDomainExcluded(user.email)
      || !this.isInSegments(segments, filterSegments);

    if (shouldSkipEnrichment) {
      this.log("Skip enrichment for ", { id: user.id, email: user.email });
    }

    return !shouldSkipEnrichment;
  }

  shouldProspect({ segments = [] }) {
    this.log("shouldProspect");
    return this.isInSegments(
      segments,
      this.settings.enrich_segments
    );
  }

  log(msg, data = '') {
    this.hull.utils.log(msg, data);
  }

  handleUserUpdate(message = {}, options = {}) {

    this.log("handleUserUpdate");

    // Stop right here if we do not match filters
    if (!this.shouldEnrich(message)) return false;

    return this.enrichUser(message.user).then(
      ({ user, person }) => {

        if (this.shouldProspect(message)) {
          return this.findSimilarPersons(person, options);
        }

        return person;
      }
    );
  }

  getUserTraitsFromPerson({ user = {}, person = {} }, mappings) {
    this.log("getUserTraitsFromPerson");
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
    this.log("saveUser", user.id || { email: user.email })
    const traits = this.getUserTraitsFromPerson(
      { user, person },
      Mappings.Person
    );
    traits["clearbit/fetched_at"] = new Date().toISOString();
    return this.hull
      .as(user.id || { email: user.email })
      .traits(traits)
      .then(() => { return { user, person } });
  }

  saveProspect(person = {}) {
    this.log("saveProspect", person.email);
    const traits = this.getUserTraitsFromPerson({ person }, Mappings.Prospect);
    traits["clearbit/prospected_at"] = new Date().toISOString();
    this.hull
      .as({ email: person.email })
      .traits(traits)
      .then(() => { return { person } });
  }

  getWebhookId(userId) {
    const { id, secret, organization } = this.hull.configuration();
    const claims = { ship: id, secret, organization, userId };
    return jwt.encode(claims, this.settings.hostSecret);
  }

  enrichUser(user = {}) {
    this.log("enrichUser");
    const touchUser = this.saveUser.bind(this, { user });

    const payload = {
      email: user.email,
      given_name: user.first_name,
      family_name: user.last_name,
      subscribe: true,
      stream: this.settings.stream
    };

    if (this.settings.stream) {
      payload.stream = true
    } else {
      payload.webhook_id = this.getWebhookId(user.id);
    }

    const { Person } = this.client;

    return Person.find(payload)
      .then(person => this.saveUser({ user, person }))
      .catch(Person.QueuedError, touchUser)
      .catch(Person.NotFoundError, touchUser);
  }

  findSimilarPersons(person = {}, options) {
    const { role, seniority, domain } = person.employment || {};
    return this.discoverSimilarCompanies(domain, options)
      .then((companies = []) => {
        return Promise.all(companies.map(company =>
          this.fetchProspectsFromCompany(company, {
            role, seniority
          })
        ));
      });
  }

  fetchProspectsFromCompany(company = {}, { role, seniority }) {
    const { domain } = company;
    const query = {
      domain,
      seniority, role,
      email: true
    };

    this.client.Prospector.search(query)
      .then((people) => {
        people.map(prospect => {
          prospect.company = company;
          this.saveProspect(prospect);
          this.enrichUser({ email: prospect.email });
        })
      });
  }

  discoverSimilarCompanies(similar, filters = {}) {
    this.log("discoverSimilarCompanies: ", similar, filters);
    const query = { ...filters, similar };
    const search = similar ? this.client.Discovery.search({ query }) : Promise.resolve({ results: [] });
    return search.then(response => response.results);
  }

}
