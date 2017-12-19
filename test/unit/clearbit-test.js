/* eslint-env node, mocha */
const assert = require("assert");
const _ = require("lodash");
const expect = require("chai").expect;
const sinon = require("sinon");
import moment from "moment";

const Clearbit = require("../../server/clearbit").default;
const getUserTraitsFromPerson = require("../../server/clearbit/mapping").default;
const { shouldProspectUsersFromDomain } = require("../../server/clearbit/prospect");
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

  it("Should directly exclude domains from prospect", (done) => {
    const hull = {
      post: () => Promise.resolve({
        pagination: {},
        aggregations: {
          without_email: { doc_count: 0 },
          by_source: { buckets: [] }
        }
      })
    };
    const private_settings = {};
    const cb = new Clearbit({ ship: { private_settings }, hull });
    const domains = ["hull.io", "google.com", "hotmail.com"];

    Promise.all(domains.map(domain => shouldProspectUsersFromDomain({
      domain,
      hull,
      settings: private_settings
    })))
      .then(([hull_io, google_com, hotmail_com]) => {
        assert(hull_io);
        assert(!google_com);
        assert(!hotmail_com);
      })
      .then(done, done);
  });

  describe("canEnrich function", () => {
    const makeHull = () => {
      const mock = {};
      mock.logger = { info: () => {} };
      mock.traits = sinon.spy(() => Promise.resolve());
      mock.asUser = sinon.spy(() => mock);
      return mock;
    };

    const makeClearbit = (private_settings = {}) => {
      const cb = new Clearbit({ ship: { private_settings }, hull: makeHull() });
      cb.client = {};
      return cb;
    };

    it("can't enrich people who have no email", () => {
      const clearbit = makeClearbit({
        enrich_segments: ["1"],
        enrich_enabled: true
      });
      const canEnrich = clearbit.canEnrich({ last_known_ip: "1.2.3.4" });
      assert.equal(canEnrich, false);
    });

    it("can't enrich if enrich disabled", () => {
      const clearbit = makeClearbit({
        enrich_segments: ["1"],
        enrich_enabled: false
      });
      const canEnrich = clearbit.canEnrich({ email: "foo@bar.com", last_known_ip: "1.2.3.4" });
      assert.equal(canEnrich, false);
    });

    it("can enrich people who have a valid email", () => {
      const clearbit = makeClearbit({
        enrich_segments: ["1"],
        enrich_enabled: true
      });
      const canEnrich = clearbit.canEnrich({ email: "foo@bar.com", last_known_ip: "1.2.3.4" });
      assert.equal(canEnrich, true);
    });
  });

  describe("shouldEnrich function", () => {
    const makeHull = () => {
      const mock = {};
      mock.logger = { info: () => {} };
      mock.traits = sinon.spy(() => Promise.resolve());
      mock.asUser = sinon.spy(() => mock);
      return mock;
    };

    const makeClearbit = (private_settings = {}) => {
      const cb = new Clearbit({ ship: { private_settings }, hull: makeHull() });
      cb.client = {};
      return cb;
    };

    it("shouldn't enrich people who have been enriched already", () => {
      const clearbit = makeClearbit({
        enrich_segments: ["1"],
        enrich_enabled: true
      });
      const shouldEnrich = clearbit.shouldEnrich({
        user: { "traits_clearbit/enriched_at": moment().format() },
        segments: [{ id: "1" }]
      });
      assert.equal(shouldEnrich, false);
    });

    it("shouldn't enrich people who have a clearbit company (because some have no role)", () => {
      const clearbit = makeClearbit({
        enrich_segments: ["2"],
        enrich_enabled: true
      });
      const shouldEnrich = clearbit.shouldEnrich({
        user: { "traits_clearbit_company/id": "1234" },
        segments: [{ id: "1" }]
      });
      assert.equal(shouldEnrich, false);
    });

    it("shouldn't enrich people who don't belong to a whitelisted segment", () => {
      const clearbit = makeClearbit({
        enrich_segments: ["2"],
        enrich_enabled: true
      });
      const shouldEnrich = clearbit.shouldEnrich({
        user: { },
        segments: [{ id: "1" }]
      });
      assert.equal(shouldEnrich, false);
    });

    it("should enrich people who belong to an whitelisted segment", () => {
      const clearbit = makeClearbit({
        enrich_segments: ["1"],
        enrich_enabled: true
      });
      const shouldEnrich = clearbit.shouldEnrich({
        user: { },
        segments: [{ id: "1" }]
      });
      assert.equal(shouldEnrich, true);
    });

    it("should enrich people who have been revealed but not enriched", () => {
      const clearbit = makeClearbit({
        enrich_segments: ["1"],
        enrich_enabled: true
      });
      const shouldEnrich = clearbit.shouldEnrich({
        user: { "traits_clearbit/revealed_at": moment().format() },
        segments: [{ id: "1" }]
      });
      assert.equal(shouldEnrich, true);
    });
  });

  describe("canReveal function", () => {
    const makeHull = () => {
      const mock = {};
      mock.logger = { info: () => {} };
      mock.traits = sinon.spy(() => Promise.resolve());
      mock.asUser = sinon.spy(() => mock);
      return mock;
    };

    const makeClearbit = (private_settings = {}) => {
      const cb = new Clearbit({ ship: { private_settings }, hull: makeHull() });
      cb.client = {};
      return cb;
    };

    it("can't reveal people who have an email", () => {
      const clearbit = makeClearbit({
        reveal_segments: ["1"],
        reveal_enabled: true
      });
      const canReveal = clearbit.canReveal({ email: "foo@bar.com", last_known_ip: "1.2.3.4" });
      assert.equal(canReveal, false);
    });

    it("can't reveal people who don't have an IP", () => {
      const clearbit = makeClearbit({
        reveal_segments: ["1"],
        reveal_enabled: true
      });
      const canReveal = clearbit.canReveal({ });
      assert.equal(canReveal, false);
    });

    it("can't reveal people if reveal disabled", () => {
      const clearbit = makeClearbit({
        reveal_segments: ["1"],
        reveal_enabled: false
      });
      const canReveal = clearbit.canReveal({ last_known_ip: "1.2.3.4" });
      assert.equal(canReveal, false);
    });

    it("can reveal people who have an IP and no email", () => {
      const clearbit = makeClearbit({
        reveal_segments: ["1"],
        reveal_enabled: true
      });
      const canReveal = clearbit.canReveal({ last_known_ip: "1.2.3.4" });
      assert.equal(canReveal, true);
    });
  });

  describe("shouldReveal function", () => {
    const makeHull = () => {
      const mock = {};
      mock.logger = { info: () => {} };
      mock.traits = sinon.spy(() => Promise.resolve());
      mock.asUser = sinon.spy(() => mock);
      return mock;
    };

    const makeClearbit = (private_settings = {}) => {
      const cb = new Clearbit({ ship: { private_settings }, hull: makeHull() });
      cb.client = {};
      return cb;
    };

    it("shouldn't reveal people who have been revealed already", () => {
      const clearbit = makeClearbit({
        reveal_segments: ["1"],
        reveal_enabled: true
      });
      const shouldReveal = clearbit.shouldReveal({
        user: { "traits_clearbit/revealed_at": moment().format() },
        segments: [{ id: "1" }]
      });
      assert.equal(shouldReveal, false);
    });


    it("shouldn't reveal people who have a clearbit company", () => {
      const clearbit = makeClearbit({
        reveal_segments: ["2"],
        reveal_enabled: true
      });
      const shouldReveal = clearbit.shouldReveal({
        user: { "traits_clearbit_company/id": "1234" },
        segments: [{ id: "1" }]
      });
      assert.equal(shouldReveal, false);
    });

    it("shouldn't reveal people who have a clearbit company in the accounts and accounts enabled", () => {
      const clearbit = makeClearbit({
        reveal_segments: ["2"],
        handle_accounts: true,
        reveal_enabled: true
      });
      const shouldReveal = clearbit.shouldReveal({
        user: { "last_known_ip": "1.2.3.4" },
        account: { "clearbit_company/id": "1234" },
        segments: [{ id: "1" }]
      });
      assert.equal(shouldReveal, false);
    });

    it("shouldn't reveal people who have been enriched", () => {
      const clearbit = makeClearbit({
        reveal_segments: ["2"],
        reveal_enabled: true
      });
      const shouldReveal = clearbit.shouldReveal({
        user: { "traits_clearbit/enriched_at": moment().format() },
        segments: [{ id: "1" }]
      });
      assert.equal(shouldReveal, false);
    });

    it("shouldn't reveal people who have been revealed", () => {
      const clearbit = makeClearbit({
        reveal_segments: ["2"],
        reveal_enabled: true
      });
      const shouldReveal = clearbit.shouldReveal({
        user: { "traits_clearbit/revealed_at": moment().format() },
        segments: [{ id: "1" }]
      });
      assert.equal(shouldReveal, false);
    });

    it("shouldn't reveal people who don't belong to a whitelisted segment", () => {
      const clearbit = makeClearbit({
        reveal_segments: ["2"],
        reveal_enabled: true
      });
      const shouldReveal = clearbit.shouldReveal({
        user: { },
        segments: [{ id: "1" }]
      });
      assert.equal(shouldReveal, false);
    });

    it("should reveal people who belong to an whitelisted segment", () => {
      const clearbit = makeClearbit({
        reveal_segments: ["1"],
        reveal_enabled: true
      });
      const shouldReveal = clearbit.shouldReveal({
        user: { },
        segments: [{ id: "1" }]
      });
      assert.equal(shouldReveal, true);
    });
  });

  describe("fetchProspect function", () => {
    const makeHull = () => {
      const mock = {};
      mock.logger = { info: () => {} };
      mock.traits = sinon.spy(() => Promise.resolve());
      mock.asUser = sinon.spy(() => mock);
      return mock;
    };
    const metric = {
      increment: sinon.spy(() => {})
    };

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

      const cb = new Clearbit({ ship: { id: "123", private_settings: {} }, hull, metric });

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

        assert(metric.increment.calledThrice);
        assert.equal(metric.increment.firstCall.args[0], "ship.incoming.users");
        assert.equal(metric.increment.firstCall.args[1], 1);
        assert.equal(metric.increment.firstCall.args[2][0], "prospect");

        assert.equal(metric.increment.secondCall.args[0], "ship.incoming.users");
        assert.equal(metric.increment.secondCall.args[1], 1);
        assert.equal(metric.increment.secondCall.args[2][0], "prospect");

        assert.equal(metric.increment.thirdCall.args[0], "ship.incoming.users");
        assert.equal(metric.increment.thirdCall.args[1], 1);
        assert.equal(metric.increment.thirdCall.args[2][0], "prospect");


        assert.equal(hull.asUser.callCount, 3);

        assert.equal(hull.asUser.getCall(0).args[0].email, "1@email.com");
        assert.equal(hull.asUser.getCall(1).args[0].email, "2@email.com");
        assert.equal(hull.asUser.getCall(2).args[0].email, "3@email.com");

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

  describe("prospectUsers function", () => {
    const postWithoutMatchingUsers = () => sinon.spy(() => Promise.resolve({
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
    }));

    const postWithMatchingUsers = () => sinon.spy(() => Promise.resolve({
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
    }));

    const hull = {
      asUser: sinon.spy(() => hull),
      asAccount: sinon.spy(() => hull),
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

    it("should use Account attributes if we have account traits for Domain lookups", () => {
      hull.post = postWithoutMatchingUsers();
      const cb = new Clearbit({
        ship: {
          private_settings: {
            prospect_domain: "account.domain"
          }
        },
        hull
      });
      cb.logSkip = sinon.spy(() => {});
      cb.fetchProspects = sinon.spy(() => {});

      cb.prospectUsers({
        "traits_clearbit_company/domain": "hull.io"
      }, {
        "domain": "clearbit.com"
      }).then(() => {
        assert(cb.fetchProspects.calledOnce);
        assert.equal(cb.fetchProspects.firstCall.args[0].domain, "clearbit.com");
      });
    });

    it("should use User attributes if no account traits for Domain lookups", () => {
      hull.post = postWithoutMatchingUsers();
      const cb = new Clearbit({
        ship: {
          private_settings: {
            prospect_domain: "account.domain"
          }
        },
        hull
      });
      cb.logSkip = sinon.spy(() => {});
      cb.fetchProspects = sinon.spy(() => {});

      cb.prospectUsers({
        "domain": "foobar.com"
      }, {
        "clearbit_domain": "clearbit.com"
      }).then(() => {
        assert(cb.fetchProspects.calledOnce);
        assert.equal(cb.fetchProspects.firstCall.args[0].domain, "foobar.com");
      });
    });

    it("should use custom Account attributes if specified", () => {
      hull.post = postWithoutMatchingUsers();
      const cb = new Clearbit({
        ship: {
          private_settings: {
            prospect_domain: "account.clearbit/domain"
          }
        },
        hull
      });
      cb.logSkip = sinon.spy(() => {});
      cb.fetchProspects = sinon.spy(() => {});

      cb.prospectUsers({
        "domain": "foobar.com"
      }, {
        "clearbit/domain": "clearbit.com"
      }).then(() => {
        assert(cb.fetchProspects.calledOnce);
        assert.equal(cb.fetchProspects.firstCall.args[0].domain, "clearbit.com");
      });
    });

    it("should use Account fallbacks if we have no data in primary domain lookups", () => {
      hull.post = postWithoutMatchingUsers();
      const cb = new Clearbit({
        ship: {
          private_settings: {
            prospect_domain: "user.empty_domain_field"
          }
        },
        hull
      });
      cb.logSkip = sinon.spy(() => {});
      cb.fetchProspects = sinon.spy(() => {});

      cb.prospectUsers({ "domain": "hull.io" }, { "domain": "clearbit.com" })
      .then(() => {
        assert(cb.fetchProspects.calledOnce);
        assert.equal(cb.fetchProspects.firstCall.args[0].domain, "clearbit.com");
      });
    });

    it("should call fetchUsers method with appropriate arguments", () => {
      hull.post = postWithoutMatchingUsers();

      const cb = new Clearbit({ ship: { private_settings: { prospect_limit_count: 3 } }, hull });
      cb.fetchProspects = sinon.spy(() => {});

      cb.prospectUsers({ domain: "foo.bar" })
      .then(() => {
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
      hull.post = postWithMatchingUsers();

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
      hull.post = postWithoutMatchingUsers();

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
      hull.post = postWithoutMatchingUsers();

      const cb = new Clearbit({ ship: { private_settings: { prospect_limit_count: 5 } }, hull });
      cb.fetchProspects = sinon.spy(() => {});

      cb.prospectUsers({ "domain": "foo.bar", "traits_clearbit_company/email": "test@foo.bar" }).then(() => {
        assert.equal(cb.fetchProspects.firstCall.args[1]["clearbit_company/email"], "test@foo.bar");
      });
    });
  });
});
