const Minihull = require("minihull");
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
    captureOutput({
      done,
      skipMessages: ["outgoing.user.start"],
      expectation: {
        "level": "info",
        "message": "outgoing.user.error",
        "context.user_email": "foo@bar.com",
        "context.subject_type": "user"
      }
    });

    nock("https://person.clearbit.com")
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
