import _ from "lodash";
import moment from "moment";
import jwt from "jwt-simple";
import { isInSegments, isValidIpAddress } from "./utils";

/**
 * Build context to pass a webhook_id
 * @param  {String} userId - Hull User id
 * @return {String}
 */
function getWebhookId(userId, clearbit) {
  const { hostSecret } = clearbit.settings;
  const { id, secret, organization } = clearbit.hull.configuration();
  const claims = { ship: id, secret, organization, userId };
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
 * Check if we can Enrich the User (based on user data and ship configuration)
 * @param  {Message({ user, segments })} message - A user:update message
 * @return {Boolean}
 */
function canEnrich(message = {}, settings = {}) {
  const { user, segments = [] } = message;
  const {
    enrich_segments = [],
    enrich_enabled,
    reveal_enabled
  } = settings;

  // Merge enrich and prospect segments lists
  // To check if the user matches one of them
  const hasEmail = !_.isEmpty(user.email);
  const canReveal = !!reveal_enabled && isValidIpAddress(user.last_known_ip) && !user.email;
  const checks = {
    email: hasEmail,
    enabled: !!enrich_enabled,
    hasSegments: !_.isEmpty(enrich_segments),
    inSegment: isInSegments(segments, enrich_segments)
  };

  return canReveal || _.every(checks);
}


/**
 * Lookup data from Clearbit's Reveal API and save it as
 * traits on the Hull user
 * @param  {User} user - Hull User
 * @return {Promise -> ClearbitPerson}
 */
function fetchFromReveal(user = {}, clearbit) {
  const ip = user.last_known_ip;
  return clearbit.client
    .reveal({ ip })
    .then(({ company }) => {
      console.warn("Revealed ip : ", JSON.stringify({ ip, company }));
      return { company };
    })
    .catch(err => {
      console.warn("fetchFromReveal failed for ip ", JSON.stringify({ ip, err: err.message }));
    });
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

  return clearbit.client
    .enrich(payload)
    .then(({ person = {}, company = {} }) => {
      return { ...person, company };
    });
}


/**
 * Check if we should Enrich the User (based on user data and ship configuration)
 * @param  {Message({ user, segments })} message - A user:update message
 * @return {Boolean}
 */
export function shouldEnrich(message = {}, settings = {}) {
  const { user = {} } = message;

  // Stop here if we cannot fetch him
  if (!canEnrich(message, settings)) return false;

  // Skip if we are waiting for the webhook
  if (lookupIsPending(user)) return false;

  const cbId = user["traits_clearbit/id"];
  const fetched_at = user["traits_clearbit/fetched_at"];

  // Enrich if we have no clearbit data. Skip if we already tried once.
  if (fetched_at) return { should: false, message: "Fetched_at already set" };
  if (cbId) return { should: false, message: "Clearbit ID already set" };

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

  if (isValidIpAddress(user.last_known_ip) && !user["traits_clearbit_company/id"] && clearbit.settings.reveal_enabled) {
    clearbit.metric("reveal");
    return fetchFromReveal(user, clearbit)
    .then(person => ({ source: "reveal", person }));
  }

  return Promise.resolve(false);
}
