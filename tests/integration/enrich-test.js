import { expect } from "chai";
import mockr from "hull-connector-dev/lib/mockr";
import server from "../../server/server";

describe("Enrich action", () => {
  const connector = {
    id: "123456789012345678901234",
    private_settings: {
      api_key: "123",
      enrich_enabled: true,
      enrich_segments: ["1"]
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

  it("should properly enrich users", done => {
    mocks
      .nock("https://person.clearbit.com")
      .get(/\/v2\/combined\/find/)
      .reply(200, {
        person: {
          id: "d54c54ad-40be-4305-8a34-0ab44710b90d",
          name: {
            fullName: "Alex MacCaw",
            givenName: "Alex",
            familyName: "MacCaw"
          },
          email: "alex@clearbit.com",
          "//": "..."
        },
        company: {
          id: "c5a6a9c5-303a-455a-935c-9dffcd2ed756",
          name: "Clearbit",
          legalName: "APIHub, Inc",
          domain: "clearbit.com",
          "//": "..."
        }
      });

    mocks.minihull.userUpdate(
      {
        connector,
        messages: [
          {
            user: {
              email: "alex@clearbit.com",
              last_known_ip: "1.1.1.1"
            },
            segments: [{ id: "1" }]
          }
        ]
      },
      batch => {
        const [first] = batch;
        expect(first.body.last_name).to.deep.equal({
          operation: "setIfNull",
          value: "MacCaw"
        });
        expect(first.body.last_name).to.deep.equal({
          operation: "setIfNull",
          value: "MacCaw"
        });
        expect(first.body.first_name).to.deep.equal({
          operation: "setIfNull",
          value: "Alex"
        });
        expect(first.body["clearbit/source"].value).to.equal("enrich");
        expect(first.body["clearbit_company/domain"]).to.equal("clearbit.com");
        expect(batch.length).to.equal(1);
        done();
      }
    );
  });

  // it("should handle Invalid Email error", done => {
  //   mocks.nock("https://person.clearbit.com")
  //     .get(/\/v2\/combined\/find/)
  //     .reply(422, {
  //       error: {
  //         message: "Invalid email.",
  //         type: "email_invalid"
  //       }
  //     });
  //
  //   mocks.minihull.on("incoming.request@/api/v1/firehose", batch => {
  //     console.log("---------------", req.body)
  //     expect(req.body.batch.length).to.equal(0);
  //     done();
  //   });
  //
  //   mocks.minihull.userUpdate(connector, [
  //     {
  //       user: {
  //         email: "foo@bar.com",
  //         last_known_ip: "1.1.1.1"
  //       },
  //       segments: [{ id: "1" }]
  //     }
  //   ]);
  // });
});
