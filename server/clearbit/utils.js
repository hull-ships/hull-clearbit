import _ from "lodash";
import rangeCheck from "range_check";
import excludes from "../excludes";

/**
 * Check if a user belongs to one of the segments listed
 * @param  {Array<Segment>} userSegments - A list of segments
 * @param  {Array<ObjectId>} segmentsListIds - A list of segment ids
 * @return {Boolean}
 */
export function isInSegments(userSegments = [], segmentsListIds = []) {
  return (
    _.isEmpty(segmentsListIds) ||
    _.intersection(userSegments.map(({ id }) => id), segmentsListIds).length > 0
  );
}

export function getDomain(user = {}, account = {}, attribute) {
  if (!attribute) {
    return null;
  }

  return (
    (attribute.indexOf("account.") === 0
      ? _.get(account, attribute.replace(/^account./, ""))
      : _.get(user, attribute)) ||
    _.get(user, "traits_clearbit/employment_domain") ||
    _.get(user, "traits_clearbit_company/domain") ||
    _.get(account, "domain") ||
    _.get(account, "clearbit_company/domain") ||
    _.get(user, "domain")
  );
}

export function now() {
  return new Date().toISOString();
}

export function isValidIpAddress(ip) {
  return (
    ip !== "0" &&
    rangeCheck.isIP(ip) &&
    !rangeCheck.inRange(ip, excludes.ip_ranges)
  );
}
