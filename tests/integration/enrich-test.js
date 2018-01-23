import { expect } from "chai";
import nock from "nock";
import bootstrap from "./support/bootstrap";

describe("Clearbit API errors", () => {
  const connector = {
    id: "123456789012345678901234",
    private_settings: {
      api_key: "123",
      enrich_enabled: true,
      enrich_segments: ["1"]
    }
  };
  const mocks = bootstrap({
    beforeEach,
    afterEach,
    port: 8000,
    connector,
    segments: [
      {
        id: "1",
        name: "A"
      }
    ]
  });

  it("should handle Invalid Email error", done => {
    nock("https://person.clearbit.com")
      .get(/\/v2\/combined\/find/)
      .reply(422, {
        error: {
          message: "Invalid email.",
          type: "email_invalid"
        }
      });

    mocks.minihull.on("incoming.request@/api/v1/firehose", req => {
      expect(req.body.batch.length).to.equal(0);
    });

    mocks.minihull
      .smartNotifyConnector(
        connector,
        "http://localhost:8000/smart-notifier",
        "user_report:update",
        [
          {
            user: {
              email: "foo@bar.com",
              last_known_ip: "1.1.1.1"
            },
            segments: [{ id: "1" }]
          }
        ]
      )
      .catch(err => {
        console.log("Connector Error response", err);
      });
  });
});
