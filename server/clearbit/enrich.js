import _ from "lodash";
import moment from "moment";
import jwt from "jwt-simple";
import { isInSegments } from "./utils";

/**
 * Build context to pass a webhook_id
 * @param  {String} userId - Hull User id
 * @return {String}
 */
function getWebhookId(userId, clearbit, accountId) {
  const { hostSecret } = clearbit.settings;
  const { id, secret, organization } = clearbit.hull.configuration();
  const claims = {
    ship: id,
    secret,
    organization,
    userId,
    accountId
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
 * Checks if an enrich call is pending and we are waiting for
 * the webhook result.
 *
 * @param {Account} account - A Hull account
 * @return {Boolean}
 */
function lookupForAccountIsPending(account) {
  const fetchedAt = _.get(account, "clearbit/fetched_at");
  const cbId = _.get(account, "clearbit/id");
  const timeThreshold = moment().subtract(1, "hours");
  return fetchedAt && moment(fetchedAt).isAfter(timeThreshold) && !cbId;
}

/**
 * Fetch data from Clearbit's Enrichment API and save it as
 * traits on the Hull user
 * @param  {User} user - Hull User
 * @return {Promise -> ClearbitPerson}
 */
function fetchFromEnrich(user = {}, clearbit, account = {}) {
  // const saveUser = this.saveUser.bind(this, user);

  const payload = {
    email: user.email,
    given_name: user.first_name,
    family_name: user.last_name,
    stream: clearbit.settings.stream
  };

  const accountId = account.id;

  if (clearbit.settings.stream) {
    payload.stream = true;
  } else {
    payload.webhook_id = getWebhookId(user.id, clearbit, accountId);
  }

  if (clearbit.hostname) {
    payload.webhook_url = `https://${clearbit.hostname}/clearbit-enrich?ship=${
      clearbit.ship.id
    }&id=${getWebhookId(user.id, clearbit, accountId)}`;
  }

  return clearbit.client
    .enrich(payload)
    .then(({ person = {}, company = {} }) => ({ ...person, company }));
}

function fetchAccountFromEnrich(account = {}, clearbit) {
  const payload = {
    domain: account.domain
  };

  if (clearbit.hostname) {
    payload.webhook_url = `https://${
      clearbit.hostname
    }/clearbit-enrich-account?ship=${clearbit.ship.id}&id=${getWebhookId(
      account.id,
      clearbit
    )}`;
  }

  return clearbit.client.enrichCompany(payload);
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
 * Check if we can enrich the Account (based on account data and ship configuration)
 *
 * @param {*} [account={}] account - An account profile
 * @param {*} [settings={}] - The connector settings
 * @returns {Bollean}
 */
export function canEnrichAccount(account = {}, settings = {}) {
  const { enrich_enabled, handle_accounts } = settings;
  return (
    enrich_enabled && !_.isEmpty(_.get(account, "domain")) && handle_accounts
  );
}

/**
 * Check if we should Enrich the User (based on user data and ship configuration)
 * @param  {Message({ user, segments })} message - A user:update message
 * @return {Boolean}
 */
export function shouldEnrich(message = {}, settings = {}) {
  const { user = {}, segments = [] } = message;
  const { enrich_segments = [], enrich_enabled } = settings;

  // Skip if enrich is disabled
  if (!enrich_enabled) {
    return { should: false, message: "Enrich isn't enabled" };
  }

  // Skip if no segments match
  if (!_.isEmpty(enrich_segments) && !isInSegments(segments, enrich_segments)) {
    return {
      should: false,
      message: "Enrich Segments are defined but User isn't in any of them"
    };
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

/**
 * Check if we should Enrich the Account (based on account data and ship configuration)
 *
 * @param {*} [message={}] message - A user:update message
 * @param {*} [settings={}] settings - Connector settings
 * @return {Boolean}
 */
export function shouldEnrichAccount(message = {}, settings = {}) {
  const { user = {}, segments = [], account = {} } = message;
  const { enrich_segments = [], enrich_enabled } = settings;

  // Skip if enrich is disabled
  if (!enrich_enabled) {
    return { should: false, message: "Enrich isn't enabled" };
  }

  // Skip if no segments match
  if (!_.isEmpty(enrich_segments) && !isInSegments(segments, enrich_segments)) {
    return {
      should: false,
      message: "Enrich Segments are defined but User isn't in any of them"
    };
  }

  // Skip if we are waiting for the webhook
  if (lookupIsPending(user) || lookupForAccountIsPending(account)) {
    return { should: false, message: "Waiting for webhook" };
  }

  // Skip if we have a Clearbit ID already
  if (user["traits_clearbit/id"] || _.get(account, "clearbit/id")) {
    return { should: false, message: "Clearbit ID present" };
  }

  // Skip if we have already tried enriching
  if (
    user["traits_clearbit/enriched_at"] ||
    _.get(account, "clearbit/enriched_at")
  ) {
    return { should: false, message: "enriched_at present" };
  }

  return { should: true };
}

export function enrichUser(user, clearbit, account) {
  if (!user) {
    return Promise.reject(new Error("Empty user"));
  }

  if (user.email) {
    return fetchFromEnrich(user, clearbit, account).then(person => ({
      source: "enrich",
      person
    }));
  }

  return Promise.resolve(false);
}

export function enrichAccount(account, clearbit) {
  if (!account) {
    return Promise.reject(new Error("Empty account"));
  }

  if (account.domain) {
    return fetchAccountFromEnrich(account, clearbit).then(company => ({
      source: "enrich",
      company
    }));
  }

  return Promise.resolve(false);
}
