/* eslint-env node, mocha */
const assert = require("assert");
const _ = require("lodash");
const expect = require("chai").expect;
const sinon = require("sinon");
import moment from "moment";

const Clearbit = require("../../server/clearbit").default;
const { getUserTraitsFromPerson } = require("../../server/clearbit/mapping");
const { isValidIpAddress } = require("../../server/clearbit/utils");

const reveal = require("./fixtures/reveal.json");
const combined = require("./fixtures/combined.json");

describe("HullClearbit Client", () => {
  it("Should return alexa rank from reveal payload", () => {
    const traits = getUserTraitsFromPerson({ user: {}, person: reveal });
    const rank = _.get(reveal, "company.metrics.alexaGlobalRank");
    assert.equal(rank, 30726);
    assert.equal(traits["clearbit_company/metrics_alexa_global_rank"], rank);
  });

  it("Should return alexa rank from combined payload", () => {
    const traits = getUserTraitsFromPerson({ user: {}, person: combined });
    const rank = _.get(combined, "company.metrics.alexaGlobalRank");
    assert.equal(rank, 55993);
    assert.equal(traits["clearbit_company/metrics_alexa_global_rank"], rank);
  });

  it("Should exlude invalid IPs from Reveal", () => {
    assert(isValidIpAddress("1.2.3.4"));

    // Not an IP address
    assert(!isValidIpAddress("0"), "0 is Not a valid IP");
    assert(!isValidIpAddress("a.b.c"), "Not a valid IP");
    assert(!isValidIpAddress("boom"), "Not a valid IP");

    // Google Bot
    assert(!isValidIpAddress("64.233.160.34"), "Google Bot");

    // Private Network
    assert(!isValidIpAddress("192.168.0.1"), "Private Network");
  });


  it("Sould directly exclude domains from prospect", (done) => {
    const post = () => Promise.resolve({
      pagination: {},
      aggregations: {
        without_email: { doc_count: 0 },
        by_source: { buckets: [] }
      }
    });
    const cb = new Clearbit({ ship: { private_settings: {} }, hull: { post } });
    const domains = ["hull.io", "google.com", "hotmail.com"];

    Promise.all(domains.map(cb.shouldProspectUsersFromDomain.bind(cb))).then(([hull_io, google_com, hotmail_com]) => {
      assert(hull_io);
      assert(!google_com);
      assert(!hotmail_com);
    }).then(done, done);
  });

  describe("for fetchProspect function", () => {
    const makeHull = () => {
      const mock = {};
      mock.logger = { info: () => {} };
      mock.traits = sinon.spy(() => Promise.resolve());
      mock.asUser = sinon.spy(() => mock);
      return mock;
    };
    const onMetric = sinon.spy(() => {});

    it("should return empty results if titles are empty", () => {
      const cb = new Clearbit({ ship: { private_settings: {} }, hull: makeHull() });
      const prospect = sinon.spy(({ role, seniority, domain }) => {
        return Promise.resolve([{ email: `${role}+${seniority}@${domain}` }]);
      });
      cb.client = {};
      cb.client.prospect = prospect;

      cb.fetchProspects({ titles: [], domain: "hull.io", role: "ceo", seniority: "manager", limit: 5 }).then(result => {
        assert.deepEqual(result, [{ email: "ceo+manager@hull.io" }]);
      });
    });

    it("should run prospects method 3 times", () => {
      const hull = makeHull();
      let counter = 0;
      const prospect = sinon.spy(() => {
        counter += 1;
        return Promise.resolve([{ email: `${counter}@email.com` }]);
      });

      const cb = new Clearbit({ ship: { id: "123", private_settings: {} }, hull, onMetric });

      cb.client = {};
      cb.client.prospect = prospect;

      cb.fetchProspects({ titles: ["veni", "vidi", "vici"], domain: "hull.io", role: "ceo", seniority: "manager", limit: 7 }).then(result => {
        expect(result).to.have.lengthOf(3);

        assert.equal(result[0].email, "1@email.com");
        assert.equal(result[1].email, "2@email.com");
        assert.equal(result[2].email, "3@email.com");


        assert.equal(prospect.firstCall.args[0].domain, "hull.io");
        assert.equal(prospect.firstCall.args[0].role, "ceo");
        assert.equal(prospect.firstCall.args[0].seniority, "manager");
        assert.equal(prospect.firstCall.args[0].title, "veni");
        assert.equal(prospect.firstCall.args[0].limit, 7);
        assert.equal(prospect.firstCall.args[0].email, true);

        assert.equal(prospect.secondCall.args[0].domain, "hull.io");
        assert.equal(prospect.secondCall.args[0].role, "ceo");
        assert.equal(prospect.secondCall.args[0].seniority, "manager");
        assert.equal(prospect.secondCall.args[0].title, "vidi");
        assert.equal(prospect.secondCall.args[0].limit, 6);
        assert.equal(prospect.secondCall.args[0].email, true);

        assert.equal(prospect.thirdCall.args[0].domain, "hull.io");
        assert.equal(prospect.thirdCall.args[0].role, "ceo");
        assert.equal(prospect.thirdCall.args[0].seniority, "manager");
        assert.equal(prospect.thirdCall.args[0].title, "vici");
        assert.equal(prospect.thirdCall.args[0].limit, 5);
        assert.equal(prospect.thirdCall.args[0].email, true);

        assert(onMetric.calledThrice);
        assert.equal(onMetric.firstCall.args[0], "saveProspect");
        assert.equal(onMetric.firstCall.args[1], 1);
        assert.equal(onMetric.firstCall.args[2].id, "123");

        assert.equal(onMetric.secondCall.args[0], "saveProspect");
        assert.equal(onMetric.secondCall.args[1], 1);
        assert.equal(onMetric.secondCall.args[2].id, "123");

        assert.equal(onMetric.thirdCall.args[0], "saveProspect");
        assert.equal(onMetric.thirdCall.args[1], 1);
        assert.equal(onMetric.thirdCall.args[2].id, "123");


        assert.equal(hull.asUser.callCount, 6);

        assert.equal(hull.asUser.getCall(0).args[0].email, "1@email.com");
        assert.equal(hull.asUser.getCall(1).args[0].email, "1@email.com");
        assert.equal(hull.asUser.getCall(2).args[0].email, "2@email.com");
        assert.equal(hull.asUser.getCall(3).args[0].email, "2@email.com");
        assert.equal(hull.asUser.getCall(4).args[0].email, "3@email.com");
        assert.equal(hull.asUser.getCall(5).args[0].email, "3@email.com");

        assert(hull.traits.calledThrice);

        assert.equal(hull.traits.firstCall.args[0].email.operation, "setIfNull");
        assert.equal(hull.traits.firstCall.args[0].email.value, "1@email.com");
        assert.equal(hull.traits.firstCall.args[0]["clearbit/prospected_at"].operation, "setIfNull");
        assert(hull.traits.firstCall.args[0]["clearbit/prospected_at"].value.match(moment().format().slice(0, 10)));
        assert.equal(hull.traits.firstCall.args[0]["clearbit/prospected_at"].operation, "setIfNull");
        assert.equal(hull.traits.firstCall.args[0]["clearbit/source"].operation, "setIfNull");
        assert.equal(hull.traits.firstCall.args[0]["clearbit/source"].value, "prospect");

        assert.equal(hull.traits.secondCall.args[0].email.operation, "setIfNull");
        assert.equal(hull.traits.secondCall.args[0].email.value, "2@email.com");
        assert.equal(hull.traits.secondCall.args[0]["clearbit/prospected_at"].operation, "setIfNull");
        assert(hull.traits.secondCall.args[0]["clearbit/prospected_at"].value.match(moment().format().slice(0, 10)));
        assert.equal(hull.traits.secondCall.args[0]["clearbit/prospected_at"].operation, "setIfNull");
        assert.equal(hull.traits.secondCall.args[0]["clearbit/source"].operation, "setIfNull");
        assert.equal(hull.traits.secondCall.args[0]["clearbit/source"].value, "prospect");

        assert.equal(hull.traits.thirdCall.args[0].email.operation, "setIfNull");
        assert.equal(hull.traits.thirdCall.args[0].email.value, "3@email.com");
        assert.equal(hull.traits.thirdCall.args[0]["clearbit/prospected_at"].operation, "setIfNull");
        assert(hull.traits.thirdCall.args[0]["clearbit/prospected_at"].value.match(moment().format().slice(0, 10)));
        assert.equal(hull.traits.thirdCall.args[0]["clearbit/prospected_at"].operation, "setIfNull");
        assert.equal(hull.traits.thirdCall.args[0]["clearbit/source"].operation, "setIfNull");
        assert.equal(hull.traits.thirdCall.args[0]["clearbit/source"].value, "prospect");
      });
    });
  });

  describe("for prospectUsers function", () => {
    const hull = {
      asUser: sinon.spy(() => hull),
      traits: sinon.spy(() => Promise.resolve()),
      logger: {
        info: () => {}
      }
    };

    it("should return false if user does not own any domain", () => {
      const cb = new Clearbit({ ship: { private_settings: {} }, hull });
      assert(!cb.prospectUsers({}));
    });

    it("should return false and skip user if his domain is known", () => {
      const cb = new Clearbit({ ship: { private_settings: {} }, hull });
      cb.logSkip = sinon.spy(() => {});

      cb.prospectUsers({ domain: "gmail.com" }).then(result => {
        assert(!result);
        assert(cb.logSkip.calledOnce);
        assert.equal(cb.logSkip.firstCall.args[1], "prospector");
        assert.equal(cb.logSkip.firstCall.args[2], "We already have known users with that domain");
      });
    });

    it("should try to get email that we set in private_settings and then skip it", () => {
      const cb = new Clearbit({ ship: { private_settings: { prospect_domain: "prospect_domain" } }, hull });
      cb.logSkip = sinon.spy(() => {});

      cb.prospectUsers({ prospect_domain: "gmail.com" }).then(result => {
        assert(!result);
        assert(cb.logSkip.calledOnce);
        assert.equal(cb.logSkip.firstCall.args[1], "prospector");
        assert.equal(cb.logSkip.firstCall.args[2], "We already have known users with that domain");
      });
    });

    it("should try to get email that we sent to clearbit previously and then skip it", () => {
      const cb = new Clearbit({ ship: { private_settings: {} }, hull });
      cb.logSkip = sinon.spy(() => {});

      cb.prospectUsers({ "traits_clearbit/employment_domain": "gmail.com" }).then(result => {
        assert(!result);
        assert(cb.logSkip.calledOnce);
        assert.equal(cb.logSkip.firstCall.args[1], "prospector");
        assert.equal(cb.logSkip.firstCall.args[2], "We already have known users with that domain");
      });
    });

    it("should try to get email that we sent to clearbit previously and then skip it", () => {
      const cb = new Clearbit({ ship: { private_settings: {} }, hull });
      cb.logSkip = sinon.spy(() => {});

      cb.prospectUsers({ "traits_clearbit_company/domain": "gmail.com" }).then(result => {
        assert(!result);
        assert(cb.logSkip.calledOnce);
        assert.equal(cb.logSkip.firstCall.args[1], "prospector");
        assert.equal(cb.logSkip.firstCall.args[2], "We already have known users with that domain");
      });
    });

    it("should call fetchUsers method with appropriate arguments", () => {
      hull.post = sinon.spy(() => {
        return Promise.resolve({
          pagination: {
            total: 1
          },
          aggregations: {
            without_email: {
              doc_count: 1
            },
            by_source: {
              buckets: [
                { key: "123", doc_count: "doc_count" }
              ]
            }
          }
        });
      });

      const cb = new Clearbit({ ship: { private_settings: { prospect_limit_count: 3 } }, hull });
      cb.fetchProspects = sinon.spy(() => {});

      cb.prospectUsers({ domain: "foo.bar" }).then(() => {
        assert.equal(hull.post.firstCall.args[1].aggs.by_source.terms.field, "traits_clearbit/source.exact");
        assert.equal(hull.post.firstCall.args[1].query.bool.should[0].term["traits_clearbit_company/domain.exact"], "foo.bar");
        assert.equal(hull.post.firstCall.args[1].query.bool.should[1].term["domain.exact"], "foo.bar");
        assert.equal(hull.post.firstCall.args[0], "search/user_reports");
        assert.equal(hull.post.firstCall.args[1].aggs.without_email.missing.field, "email");
        assert.equal(hull.post.firstCall.args[1].search_type, "count");

        assert.equal(cb.fetchProspects.firstCall.args[0].domain, "foo.bar");
        assert.equal(cb.fetchProspects.firstCall.args[0].limit, 3);
        assert(cb.fetchProspects.firstCall.args[0].email);
      });
    });

    it("should skip user if prospect if we have known users with that domain", () => {
      hull.post = sinon.spy(() => {
        return Promise.resolve({
          pagination: {
            total: 1
          },
          aggregations: {
            without_email: {
              doc_count: 2
            },
            by_source: {
              buckets: [
                { key: "123", doc_count: "doc_count" }
              ]
            }
          }
        });
      });

      const cb = new Clearbit({ ship: { private_settings: { prospect_limit_count: 3 } }, hull });
      cb.fetchProspects = sinon.spy(() => {});
      cb.logSkip = sinon.spy(() => {});

      cb.prospectUsers({ domain: "foo.bar" }).then((result) => {
        assert(!result);
        assert(cb.logSkip.calledOnce);
        assert.equal(cb.logSkip.firstCall.args[1], "prospector");
        assert.equal(cb.logSkip.firstCall.args[2], "We already have known users with that domain");
      });
    });

    it("should add to query prospect filters", () => {
      hull.post = sinon.spy(() => {
        return Promise.resolve({
          pagination: {
            total: 1
          },
          aggregations: {
            without_email: {
              doc_count: 1
            },
            by_source: {
              buckets: [
                { key: "123", doc_count: "doc_count" }
              ]
            }
          }
        });
      });

      const cb = new Clearbit({ ship: { private_settings: {
        prospect_limit_count: 5,
        prospect_filter_seniority: ["manager"],
        prospect_filter_titles: ["veni", "vidi", "vici"],
        prospect_filter_role: ["ceo"]
      } }, hull });
      cb.fetchProspects = sinon.spy(() => {});

      cb.prospectUsers({ domain: "foo.bar" }).then(() => {
        assert.equal(cb.fetchProspects.firstCall.args[0].seniority[0], "manager");
        assert.equal(cb.fetchProspects.firstCall.args[0].titles[0], "veni");
        assert.equal(cb.fetchProspects.firstCall.args[0].titles[1], "vidi");
        assert.equal(cb.fetchProspects.firstCall.args[0].titles[2], "vici");
        assert.equal(cb.fetchProspects.firstCall.args[0].role[0], "ceo");
      });
    });

    it("should add company traits to user", () => {
      hull.post = sinon.spy(() => {
        return Promise.resolve({
          pagination: {
            total: 1
          },
          aggregations: {
            without_email: {
              doc_count: 1
            },
            by_source: {
              buckets: [
                { key: "123", doc_count: "doc_count" }
              ]
            }
          }
        });
      });

      const cb = new Clearbit({ ship: { private_settings: { prospect_limit_count: 5 } }, hull });
      cb.fetchProspects = sinon.spy(() => {});

      cb.prospectUsers({ domain: "foo.bar", "traits_clearbit_company/email": "test@foo.bar" }).then(() => {
        assert.equal(cb.fetchProspects.firstCall.args[1]["clearbit_company/email"], "test@foo.bar");
      });
    });
  });
});
