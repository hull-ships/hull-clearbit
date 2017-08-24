# 0.2.3
- fix issues with prospector UI
# 0.2.2
- handle errors on prospection and discovery API

# 0.2.1
- upgrade hull-node@0.12.2

# 0.2.0
- prospector UI allows to define multiple roles, seniority levels and titles now
- prospector fetch strategy was changed - now we iterate over titles and fetch prospects for each title until we hit the fetch limit, without title 
- `prospect_filter_role` and `prospect_filter_seniority` changed from string to an array

# 0.1.6
- set default cache ttl

# 0.1.5
- don't skip enrich if already revealed
- add better logging for reveal

# 0.1.4
- handle Clearbit API errors on the enrich method
- restructurized tests

# 0.1.3
- upgrade hull-node to 0.11.11

# 0.1.2
- upgrade hull-node to 0.11.9 to avoid logging the whole user object in the context of the logs
- require newrelic at the script start

# 0.1.1
- change the webhook endpoint for enrich to distinguish it from old webhook url
- log query and body for old webhook url
- fix old `.as` calls

# 0.1.0
- [feature] account support
- [feature] exclude invalid IPs and domains
