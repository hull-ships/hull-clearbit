const Minihull = require("minihull");
const expect = require("chai").expect;
const nock = require("nock");
const captureOutput = require("./support/capture-output");

const bootstrap = require("./support/bootstrap");

describe("Clearbit API errors", function test() {
  let server;
  let minihull;

  beforeEach((done) => {
    minihull = new Minihull();
    server = bootstrap(8000);
    minihull.listen(8001).then(done);
    minihull.stubConnector({
      id: "123456789012345678901234",
      private_settings: {
        api_key: "123",
        prospect_enabled: true,
        prospect_segments: ["1"],
        prospect_filter_titles: ["foo"],
        prospect_limit_count: 2
      }
    });
    minihull.stubSegments([{
      id: "1",
      name: "A"
    }]);
  });

  afterEach(() => {
    minihull.close();
    server.close();
    nock.cleanAll();
  });

  it("should handle automatic prospection", (done) => {
    const clearbit = nock("https://prospector.clearbit.com")
      .get("/v1/people/search")
      .query({
        domain: "foo.bar",
        limit: 2,
        email: true,
        title: "foo"
      })
      .reply(200, [{
        email: "foo@foo.bar"
      }]);

    minihull.stubApp("/api/v1/search/user_reports").respond({
      pagination: { total: 0 },
      aggregations: {
        without_email: {
          doc_count: 0
        },
        by_source: {
          buckets: []
        }
      }
    });
    minihull.on("incoming.request@/api/v1/firehose", (req) => {
      expect(req.body.batch[0].type).to.equal("track");
      expect(req.body.batch[0].body.properties.emails[0]).to.equal("foo@foo.bar");
      expect(req.body.batch[0].body.properties.found).to.equal(1);
      expect(req.body.batch[0].body.event).to.equal("Clearbit Prospector Triggered");

      expect(req.body.batch[1].type).to.equal("traits");
      expect(req.body.batch[1].body.email.value).to.equal("foo@foo.bar");
      expect(req.body.batch[1].body["clearbit/prospected_at"].value).to.not.be.null;
      expect(req.body.batch[1].body["clearbit/prospected_from"].value).to.equal("abc");
      expect(req.body.batch[1].body["clearbit/source"].value).to.equal("prospect");
      clearbit.done();
      done();
    });

    minihull.notifyConnector("123456789012345678901234", "http://localhost:8000/notify", "user_report:update", {
      user: {
        id: "abc",
        domain: "foo.bar"
      },
      segments: [{ id: "1" }]
    }).then(() => {});
  });

  it("should respect limit setup", (done) => {
    minihull.stubConnector({
      id: "123456789012345678901234",
      private_settings: {
        api_key: "123",
        prospect_enabled: true,
        prospect_segments: ["1"],
        prospect_filter_titles: ["foo", "bar", "zyx"],
        prospect_limit_count: 2
      }
    });


    nock("https://prospector.clearbit.com")
      .get("/v1/people/search")
      .query({
        domain: "foo.bar",
        limit: 2,
        email: true,
        title: "foo"
      })
      .reply(200, [{
        email: "foo@foo.bar"
      }]);

    nock("https://prospector.clearbit.com")
      .get("/v1/people/search")
      .query({
        domain: "foo.bar",
        limit: 1,
        email: true,
        title: "bar"
      })
      .reply(200, [{
        email: "foo@bar.bar"
      }]);

    const thirdTitleCall = nock("https://prospector.clearbit.com")
      .get("/v1/people/search")
      .query({
        domain: "foo.bar",
        limit: 2,
        email: true,
        title: "zyx"
      })
      .reply(200, [{
        email: "foo@zyx.bar"
      }]);

    minihull.stubApp("/api/v1/search/user_reports").respond({
      pagination: { total: 0 },
      aggregations: {
        without_email: {
          doc_count: 0
        },
        by_source: {
          buckets: []
        }
      }
    });
    minihull.on("incoming.request@/api/v1/firehose", (req) => {
      expect(req.body.batch.length).to.equal(3);

      expect(req.body.batch[0].type).to.equal("track");
      expect(req.body.batch[0].body.properties.emails[0]).to.equal("foo@foo.bar");
      expect(req.body.batch[0].body.properties.emails[1]).to.equal("foo@bar.bar");
      expect(req.body.batch[0].body.properties.found).to.equal(2);
      expect(req.body.batch[0].body.event).to.equal("Clearbit Prospector Triggered");

      expect(req.body.batch[1].type).to.equal("traits");
      expect(req.body.batch[1].body.email.value).to.equal("foo@foo.bar");
      expect(req.body.batch[1].body["clearbit/prospected_at"].value).to.not.be.null;
      expect(req.body.batch[1].body["clearbit/prospected_from"].value).to.equal("abc");
      expect(req.body.batch[1].body["clearbit/source"].value).to.equal("prospect");

      expect(thirdTitleCall.isDone()).is.false;
      done();
    });

    minihull.notifyConnector("123456789012345678901234", "http://localhost:8000/notify", "user_report:update", {
      user: {
        id: "abc",
        domain: "foo.bar"
      },
      segments: [{ id: "1" }]
    }).then(() => {});
  });

  it("should handle Rate limit error", (done) => {
    captureOutput({
      done,
      skipMessages: ["outgoing.user.skip", "outgoing.user.start"],
      expectation: {
        "level": "info",
        "message": "outgoing.user.error",
        "context.user_id": "abc",
        "context.subject_type": "user"
      }
    });

    const clearbit = nock("https://prospector.clearbit.com")
      .get("/v1/people/search")
      .query({
        domain: "foo.bar",
        limit: 2,
        email: true,
        title: "foo"
      })
      .reply(409, {
        error: {
          message: "Your account is over it's quota"
        }
      });

    minihull.stubApp("/api/v1/search/user_reports").respond({
      pagination: { total: 0 },
      aggregations: {
        without_email: {
          doc_count: 0
        },
        by_source: {
          buckets: []
        }
      }
    });
    minihull.notifyConnector("123456789012345678901234", "http://localhost:8000/notify", "user_report:update", {
      user: {
        id: "abc",
        domain: "foo.bar"
      },
      segments: [{ id: "1" }]
    }).then(() => {});
  });
});
