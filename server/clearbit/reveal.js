import _ from "lodash";
import { isInSegments, isValidIpAddress } from "./utils";

/**
 * Lookup data from Clearbit's Reveal API and save it as
 * traits on the Hull user
 * @param  {User} user - Hull User
 * @return {Promise -> ClearbitPerson}
 */
function fetchFromReveal(user = {}, clearbit) {
  const ip = user.last_known_ip;
  const logger = clearbit.hull.asUser(user).logger;
  return clearbit.client
    .reveal({ ip })
    .then(({ company }) => {
      logger.info("clearbit.reveal.success", { ip, company: _.pick(company, "name", "domain") });
      return { company };
    });
}

/**
 * Checks if the user fullfills the right conditions to be revealed.
 * @param  {User({ last_known_ip, email })} user - A user profile
 * @return {Boolean}
 */
export function canReveal(user = {}, settings = {}) {
  const { reveal_enabled } = settings;
  return reveal_enabled && isValidIpAddress(user.last_known_ip) && !user.email;
}

/**
 * Check if we should Reveal the User (based on user data and ship configuration)
 * @param  {Message({ user, segments })} message - A user:update message
 * @return {Boolean}
 */
export function shouldReveal(message = {}, settings = {}) {
  const { user = {}, account = {}, segments = [] } = message;
  const {
    handle_accounts = false,
    reveal_segments = [],
    reveal_enabled
  } = settings;

  // Skip if reveal is disabled
  if (!reveal_enabled) {
    // console.log("---Deprecated feature enabled----", "`reveal_enabled: true`");
    return { should: false, message: "Reveal isn't enabled" };
  }

  // Skip if no segments match
  if (!_.isEmpty(reveal_segments) && !isInSegments(segments, reveal_segments)) {
    return { should: false, message: "Reveal segments are defined but user isn't in any of them" };
  }

  // Skip if clearbit company already set
  if (!!user["traits_clearbit_company/id"]) {
    return { should: false, message: "Clearbit Company ID present" };
  }

  // Skip if clearbit company already set on account
  if (handle_accounts && !!account["clearbit_company/id"]) {
    return { should: false, message: "Clearbit Company ID present" };
  }

  // Skip if user has been enriched
  if (!!user["traits_clearbit/enriched_at"]) {
    return { should: false, message: "enriched_at present" };
  }

  // Skip if user has been revealed
  if (!!user["traits_clearbit/revealed_at"]) {
    return { should: false, message: "revealed_at present" };
  }

  return { should: true };
}

export function revealUser(user, clearbit) {
  clearbit.metric("reveal");
  return fetchFromReveal(user, clearbit)
    .then(person => (person && { source: "reveal", person }));
}
