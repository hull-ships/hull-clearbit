import { expect } from "chai";
import mockr from "hull-connector-dev/lib/mockr";
import server from "../../server/server";

describe("Reveal action", () => {
  const connector = {
    id: "123456789012345678901234",
    private_settings: {
      api_key: "123",
      reveal_enabled: true,
      reveal_segments: ["1"]
    }
  };
  const mocks = mockr({
    server,
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

  it("should properly reveal users", done => {
    mocks.nock("https://reveal.clearbit.com")
      .get(/v1\/companies\/find/)
      .query({ ip: "100.0.0.0" })
      .reply(200, {
        ip: "100.0.0.0",
        fuzzy: true,
        domain: "hull.io",
        company: {
          name: "Hull",
          tags: [
            "Software",
            "SAAS",
            "B2B",
            "Information Technology & Services",
            "Technology",
            "Internet"
          ],
          metrics: {
            alexaUsRank: 1,
            alexaGlobalRank: 1,
            employees: 1000,
            employeesRange: "1000-2000",
            raised: 100000000
          }
        }
      });

    mocks.minihull.userUpdate(
      {
        connector,
        messages: [
          {
            user: {
              id: "1234",
              anonymous_ids: ["foobar-anonymous"],
              email: null,
              last_known_ip: "100.0.0.0"
            },
            segments: [{ id: "1" }]
          }
        ]
      },
      batch => {
        const [first] = batch;
        expect(batch.length).to.equal(1);
        expect(first.type).to.equal("traits");
        expect(first.body["clearbit/source"].value).to.equal("reveal");
        expect(first.body["clearbit/revealed_at"].value).to.not.be.null;
        expect(first.body["clearbit/revealed_at"].operation).to.eql(
          "setIfNull"
        );
        expect(first.body["clearbit/fetched_at"].value).to.not.be.null;
        expect(first.body["clearbit/fetched_at"].operation).to.eql("setIfNull");
        expect(first.body["clearbit_company/name"]).to.equal("Hull");
        done();
      }
    );
  });

  it("should properly reveal accounts if accounts enabled", done => {
    mocks.nock("https://reveal.clearbit.com")
      .get(/v1\/companies\/find/)
      .query({ ip: "100.0.0.0" })
      .reply(200, {
        ip: "100.0.0.0",
        fuzzy: true,
        domain: "hull.io",
        company: {
          domain: "hull.io",
          name: "Hull",
          tags: [
            "Software",
            "SAAS",
            "B2B",
            "Information Technology & Services",
            "Technology",
            "Internet"
          ],
          metrics: {
            alexaUsRank: 1,
            alexaGlobalRank: 1,
            employees: 1000,
            employeesRange: "1000-2000",
            raised: 100000000
          }
        }
      });

    mocks.minihull.userUpdate(
      {
        connector: {
          id: "123456789012345678901234",
          private_settings: {
            api_key: "123",
            handle_accounts: true,
            reveal_enabled: true,
            reveal_segments: ["1"]
          }
        },
        messages: [
          {
            user: {
              id: "1234",
              anonymous_ids: ["foobar-anonymous"],
              email: null,
              last_known_ip: "100.0.0.0"
            },
            segments: [{ id: "1" }]
          }
        ]
      },
      batch => {
        const [first, second] = batch;
        expect(batch.length).to.equal(2);
        expect(first.type).to.equal("traits");
        expect(first.body["clearbit/source"].value).to.equal("reveal");

        expect(first.body["clearbit/revealed_at"].value).to.not.be.null;
        expect(first.body["clearbit/revealed_at"].operation).to.eql(
          "setIfNull"
        );
        expect(first.body["clearbit/fetched_at"].value).to.not.be.null;
        expect(first.body["clearbit/fetched_at"].operation).to.eql("setIfNull");

        expect(second.type).to.equal("traits");
        expect(second.claims["io.hull.asAccount"].domain).to.equal("hull.io");
        expect(second.claims["io.hull.subjectType"]).to.equal("account");
        expect(second.body.domain.value).to.equal("hull.io");
        expect(second.body.domain.operation).to.equal("setIfNull");
        expect(second.body.name.value).to.equal("Hull");
        expect(second.body["clearbit/domain"]).to.equal("hull.io");
        expect(second.body["clearbit/metrics_alexa_global_rank"]).to.equal(1);
        done();
      }
    );
  });
});
