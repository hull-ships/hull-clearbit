import _ from "lodash";
import moment from "moment";
import jwt from "jwt-simple";
import { isInSegments } from "./utils";

/**
 * Build context to pass a webhook_id
 * @param  {String} userId - Hull User id
 * @return {String}
 */
function getWebhookId(userId, clearbit) {
  const { hostSecret } = clearbit.settings;
  const { id, secret, organization } = clearbit.hull.configuration();
  const claims = {
    ship: id, secret, organization, userId
  };
  return hostSecret && jwt.encode(claims, hostSecret);
}

/**
 * Check if an enrich call has been made in the last hour
 * and we are still waiting for the webhook to ping us
 * @param  {User} user - A User
 * @return {Boolean}
 */
function lookupIsPending(user) {
  const fetched_at = user["traits_clearbit/fetched_at"];
  const cbId = user["traits_clearbit/id"];
  const one_hour_ago = moment().subtract(1, "hours");
  return fetched_at && moment(fetched_at).isAfter(one_hour_ago) && !cbId;
}

/**
 * Fetch data from Clearbit's Enrichment API and save it as
 * traits on the Hull user
 * @param  {User} user - Hull User
 * @return {Promise -> ClearbitPerson}
 */
function fetchFromEnrich(user = {}, clearbit) {
  // const saveUser = this.saveUser.bind(this, user);

  const payload = {
    email: user.email,
    given_name: user.first_name,
    family_name: user.last_name,
    stream: clearbit.settings.stream
  };

  if (clearbit.settings.stream) {
    payload.stream = true;
  } else {
    payload.webhook_id = getWebhookId(user.id, clearbit);
  }

  if (clearbit.hostname) {
    payload.webhook_url = `https://${clearbit.hostname}/clearbit-enrich?ship=${clearbit.ship.id}&id=${getWebhookId(user.id, clearbit)}`;
  }

  const { logger } = clearbit.hull.asUser(user);

  return clearbit.client
    .enrich(payload)
    .then(({ person = {}, company = {} }) => {
      logger.info("clearbit.enrich.success", {
        person: _.pick(person, "id", "name", "email"),
        company: _.pick(company, "id", "name", "domain")
      });
      return { ...person, company };
    });
}

/**
 * Check if we can Enrich the User (based on user data and ship configuration)
 * @param  {User({ email })} user - A user profile
 * @return {Boolean}
 */
export function canEnrich(user = {}, settings = {}) {
  // Merge enrich and prospect segments lists
  // To check if the user matches one of them
  const { enrich_enabled } = settings;
  return enrich_enabled && !_.isEmpty(user.email);
}

/**
 * Check if we should Enrich the User (based on user data and ship configuration)
 * @param  {Message({ user, segments })} message - A user:update message
 * @return {Boolean}
 */
export function shouldEnrich(message = {}, settings = {}) {
  const { user = {}, segments = [] } = message;
  const {
    enrich_segments = [],
    enrich_enabled
  } = settings;

  // Skip if enrich is disabled
  if (!enrich_enabled) {
    return { should: false, message: "Enrich isn't enabled" };
  }

  // Skip if no segments match
  if (!_.isEmpty(enrich_segments) && !isInSegments(segments, enrich_segments)) {
    return { should: false, message: "Enrich Segments are defined but User isn't in any of them" };
  }

  // Skip if we are waiting for the webhook
  if (lookupIsPending(user)) {
    return { should: false, message: "Waiting for webhook" };
  }

  // Skip if we have a Clearbit ID already
  if (user["traits_clearbit/id"]) {
    return { should: false, message: "Clearbit ID present" };
  }

  // Skip if we have already tried enriching
  if (user["traits_clearbit/enriched_at"]) {
    return { should: false, message: "enriched_at present" };
  }

  return { should: true };
}

export function enrichUser(user, clearbit) {
  if (!user) {
    return Promise.reject(new Error("Empty user"));
  }

  if (user.email) {
    clearbit.metric("enrich");
    return fetchFromEnrich(user, clearbit)
      .then(person => ({ source: "enrich", person }));
  }

  return Promise.resolve(false);
}
