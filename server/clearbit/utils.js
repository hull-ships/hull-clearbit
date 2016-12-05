import _ from "lodash";

/**
 * Check if a user belongs to one of the segments listed
 * @param  {Array<Segment>} userSegments - A list of segments
 * @param  {Array<ObjectId>} segmentsListIds - A list of segment ids
 * @return {Boolean}
 */
export function isInSegments(userSegments = [], segmentsListIds = []) {
  return _.isEmpty(segmentsListIds) || _.intersection(
    userSegments.map(({ id }) => id),
    segmentsListIds
  ).length > 0;
}

export function getDomain(user) {
  return user["traits_clearbit/employment_domain"] || user["traits_clearbit_company/domain"] || user['traits_domain'] || users.domain;
}

export function now() {
  return new Date().toISOString();
}
