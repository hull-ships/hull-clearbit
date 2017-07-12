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
        enrich_enabled: true,
        enrich_segments: ["1"]
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
    let originalWrite = process.stdout.write;
    process.stdout.write = (log) => {
      process.stdout.write = originalWrite;
      const logLine = JSON.parse(log);
      expect(logLine.level).to.equal("info");
      expect(logLine.message).to.equal("outgoing.user.error");
      expect(logLine.context.user_email).to.equal("foo@bar.com");
      expect(logLine.context.subject_type).to.equal("user");
      done();
    };

    const clearbit = nock('https://person.clearbit.com')
      .get(/\/v2\/combined\/find/)
      .reply(422, {
        error: {
          message: "Invalid email.",
          type: "email_invalid"
        }
      });

    minihull.notifyConnector("123456789012345678901234", "http://localhost:8000/notify", "user_report:update", {
      user: {
        email: "foo@bar.com",
        last_known_ip: "1.1.1.1"
      },
      segments: [{ id: "1" }]
    }).then(() => {});
  });
});
