import _ from "lodash";
import { isInSegments, getDomain } from "./utils";
import excludes from "../excludes";

/**
 * Check if we can Enrich the User (based on user data and ship configuration)
 * @param  {User({ email })} user - A user profile
 * @return {Boolean}
 */
export function canProspect({ user = {}, account = {} }, settings = {}) {
  // Merge enrich and prospect segments lists
  // To check if the user matches one of them
  const { prospect_domain = "domain" } = settings;
  const domain = getDomain(user, account, prospect_domain);

  if (!domain) {
    return false;
  }

  return true;
}

export function shouldProspect(message = {}, settings = {}) {
  const { user = {}, account = {}, segments = [] } = message;
  const { prospect_segments = [], prospect_enabled } = settings;

  // Skip if prospect is disabled
  if (!prospect_enabled) {
    return { should: false, message: "Prospect isn't enabled" };
  }

  if (!isInSegments(segments, prospect_segments)) {
    return { should: false, message: "user isn't in any prospectable segment" };
  }

  // Only prospect anonymous users
  if (user.email) {
    return {
      should: false,
      message: "We only prospect anonymous users"
    };
  }

  // Don't prospect twice
  if (
    user["traits_clearbit/prospected_at"] ||
    user["traits_clearbit/prospector_triggered_at"] ||
    account["clearbit/prospected_at"]
  ) {
    return {
      should: false,
      message: "We don't prospect the same domain twice"
    };
  }

  return { should: true };
}

/**
 * Check if we already have known users from that domain
 * or if we have enough revealed visitors to prospect
 * @param  {Object(user)} payload - Hull user object
 * @return {Promise -> Bool}
 */
export function shouldProspectUsersFromDomain({ domain, hull, settings }) {
  if (_.includes(excludes.domains, domain)) {
    return Promise.resolve(false);
  }

  const query = {
    bool: {
      should: [
        { term: { "traits_clearbit_company/domain.exact": domain } },
        { term: { "domain.exact": domain } }
      ],
      minimum_should_match: 1
    }
  };

  if (settings.handle_accounts) {
    query.bool.should.push(
      { term: { "account.domain.exact": domain } },
      { term: { "account.clearbit.domain.exact": domain } }
    );
  }

  const aggs = {
    without_email: { missing: { field: "email" } },
    by_source: { terms: { field: "traits_clearbit/source.exact" } }
  };

  const params = { query, aggs, search_type: "count" };

  return hull
    .post("search/user_reports", params)
    .then(({ pagination, aggregations }) => {
      const { total } = pagination;
      const anonymous = aggregations.without_email.doc_count;
      const bySource = _.reduce(
        aggregations.by_source.buckets,
        (bs, bkt) => {
          return { ...bs, [bkt.key]: bkt.doc_count };
        },
        {}
      );

      // Skip prospect if we have known users with that domain
      if (total > 0 && total !== anonymous) {
        return false;
      }

      // Prospect if at least one of those anonymous has been discovered
      if (bySource.discover && bySource.discover > 0) {
        return true;
      }

      const min_contacts = settings.reveal_prospect_min_contacts || 1;

      if (bySource.reveal && anonymous >= min_contacts) {
        return true;
      }

      return true;
    });
}
