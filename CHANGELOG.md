# Changelog

## 0.4.12
- use shorter titles for segments list settings

## 0.4.11
- upgrade nodejs to v8.10.0

## 0.4.10
- adds dashboard tab
- changes ident building when saving users
- write email, first and last name to clearbit traits group, add setIfNull for `first_name` and `last_name`

## 0.4.9
- Fix Prospector UI not having a Source user to assign track & traits

## 0.4.8
- add pm2 max memory limit

## 0.4.7
- introduce separate babelJS configuration for server side code

## 0.4.6
- optimize node for memory usage and add flow control env vars

## 0.4.5
- fix batch endpoint by correcting Bottleneck signature

## 0.4.4
- make pm2 output raw logs without prefix

## 0.4.3
- adjust pm2 startup script

## 0.4.2
- upgrade Node to v8 and install pm2

## 0.4.1
- downgrade Node to v6

## 0.3.3
- improve test coverage and integration tests
- Fix prospector minimum anonymous user condition
- Even better metrics.
- Update dependencies
- use `/test/mocha.opts` to centralize mocha config, now atom's `mocha-test-runner plugin can be used` - no need to open a terminal, open the test file and run `ctrl-alt-m`

## 0.3.2
- Add Status Endpoint
- Improve Logging
- Improve Settings UI

## 0.3.1
- Use hull-node's metrics tooling

## 0.3.0
- update dependencies
- metrics calls
- upgrade hull to 0.13.9
- add support for smart-notifier

## 0.2.8
- Stores `prospected_at` in account domain
- Looks in Accounts for domain attributes
- Has fallback strategy for domain looking into Account data
- factors tests

## 0.2.7

- Stores a `Clearbit Prospector Triggered` event on the user that triggers prospection, storing the following values:
  + query content
  + number of results found
  + list of prospected emails found
- Adds a `clearbit/prospected_from` field on the prospected users with the identity of the User that triggered the prospection


## 0.2.6

- changes default behaviour of Reveal to only send users in a set of segments. Transition phase: Empty reveal_segments sends everyone.
- Deprecated: "reveal enabled" checkbox - empty revealed segment will achieve the same thing (in future version)
- Refactors reveal and enrich code to define responsibilities
- Refactors tests to abstract console parsing logic

## 0.2.5

- assign anonymousId for Prospected users to `clearbit-prospect:${prospect.id}`

## 0.2.4

- fix issues with non-human readable error messages in prospector UI
- filter error messages for 'unknown_ip' to classify errors properly

## 0.2.3

- fix issues with prospector UI

## 0.2.2

- handle errors on prospection and discovery API

## 0.2.1

- upgrade hull-node@0.12.2

## 0.2.0

- prospector UI allows to define multiple roles, seniority levels and titles now
- prospector fetch strategy was changed - now we iterate over titles and fetch prospects for each title until we hit the fetch limit, without title
- `prospect_filter_role` and `prospect_filter_seniority` changed from string to an array

## 0.1.6

- set default cache ttl

## 0.1.5

- don't skip enrich if already revealed
- add better logging for reveal

## 0.1.4

- handle Clearbit API errors on the enrich method
- restructurized tests

## 0.1.3

- upgrade hull-node to 0.11.11

## 0.1.2

- upgrade hull-node to 0.11.9 to avoid logging the whole user object in the context of the logs
- require newrelic at the script start

## 0.1.1

- change the webhook endpoint for enrich to distinguish it from old webhook url
- log query and body for old webhook url
- fix old `.as` calls

## 0.1.0

- [feature] account support
- [feature] exclude invalid IPs and domains
