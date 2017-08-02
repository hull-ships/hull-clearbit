const Minihull = require("minihull");
const expect = require("chai").expect;
const moment = require("moment");
const nock = require("nock");

const bootstrap = require("./support/bootstrap");

describe("Clearbit API errors", function test() {
  let server, minihull;
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
        prospect_filter_titles: ["foo"]
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
  });

  it("should handle Invalid Email error", (done) => {
    const clearbit = nock("https://prospector.clearbit.com")
      .get("/v1/people/search?domain=foo.bar&limit=NaN&email=true&title=foo")
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
      expect(req.body.batch[0].type).to.equal("traits");
      expect(req.body.batch[0].body.email.value).to.equal("foo@foo.bar");
      expect(req.body.batch[0].body["clearbit/prospected_at"].value).to.not.be.null;
      expect(req.body.batch[0].body["clearbit/source"].value).to.equal("prospect");
      done();
    });

    minihull.notifyConnector("123456789012345678901234", "http://localhost:8000/notify", "user_report:update", {
      user: {
        id: "abc",
        domain: "foo.bar"
      },
      segments: [{ id: "1" }]
    }).then(() => {}).catch((err) => {
      console.log('ERR', err);
    });
  });
});
