import { expect } from "chai";
import nock from "nock";
import bootstrap from "./support/bootstrap";

describe("Clearbit API errors", () => {
  const mocks = bootstrap({
    beforeEach,
    afterEach,
    port: 8000,
    segments: [
      {
        id: "1",
        name: "A"
      }
    ]
  });

  it("should prospect properly with accounts enabled", done => {
    const clearbit = nock("https://prospector.clearbit.com")
      .get("/v1/people/search")
      .query({
        domain: "domain.com",
        limit: 2,
        email: true,
        title: "foo"
      })
      .reply(200, [{ email: "foo@foo.bar", id: "foobar" }]);

    mocks.minihull.stubApp("/api/v1/search/user_reports").respond({
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

    mocks.minihull.userUpdate(
      {
        connector: {
          id: "123456789012345678901234",
          private_settings: {
            api_key: "123",
            handle_accounts: true,
            prospect_enabled: true,
            prospect_segments: ["1"],
            prospect_filter_titles: ["foo"],
            prospect_limit_count: 2
          }
        },
        messages: [
          {
            user: {
              id: "abc",
              "traits/clearbit/source": "reveal"
            },
            account: {
              id: "ACCOUNTID",
              domain: "domain.com"
            },
            segments: [{ id: "1" }]
          }
        ]
      },
      batch => {
        const [first, second, third, fourth] = batch;
        expect(batch.length).to.equal(4);

        expect(first.type).to.equal("track");
        expect(first.body.properties.emails[0]).to.equal("foo@foo.bar");
        expect(first.body.properties.found).to.equal(1);
        expect(first.body.event).to.equal("Clearbit Prospector Triggered");

        expect(second.type).to.equal("traits");
        expect(second.body["clearbit/prospected_at"].value).to.not.be.null;

        expect(third.type).to.equal("traits");
        expect(third.body["clearbit/prospected_at"].value).to.not.be.null;

        expect(fourth.type).to.equal("traits");
        expect(fourth.body.email.value).to.equal("foo@foo.bar");
        expect(fourth.body["clearbit/prospected_at"].value).to.not.be.null;
        expect(fourth.body["clearbit/prospected_from"].value).to.equal("abc");
        expect(fourth.body["clearbit/source"].value).to.equal("prospector");
        clearbit.done();
        done();
      }
    );
  });

  it("should handle automatic prospection", done => {
    const clearbit = nock("https://prospector.clearbit.com")
      .get("/v1/people/search")
      .query({
        domain: "foo.bar",
        limit: 2,
        email: true,
        title: "foo"
      })
      .reply(200, [{ email: "foo@foo.bar" }]);

    mocks.minihull.stubApp("/api/v1/search/user_reports").respond({
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

    mocks.minihull.userUpdate(
      {
        connector: {
          id: "123456789012345678901234",
          private_settings: {
            api_key: "123",
            prospect_enabled: true,
            prospect_segments: ["1"],
            prospect_filter_titles: ["foo"],
            prospect_limit_count: 2
          }
        },
        messages: [
          {
            user: {
              id: "abc",
              domain: "foo.bar",
              "traits/clearbit/source": "reveal"
            },
            segments: [{ id: "1" }]
          }
        ]
      },
      batch => {
        const [first, second, third, fourth] = batch;
        expect(batch.length).to.equal(4);

        expect(first.type).to.equal("track");
        expect(first.body.properties.emails[0]).to.equal("foo@foo.bar");
        expect(first.body.properties.found).to.equal(1);
        expect(first.body.event).to.equal("Clearbit Prospector Triggered");

        expect(second.type).to.equal("traits");
        expect(second.body["clearbit/prospected_at"].value).to.not.be.null;

        expect(third.type).to.equal("traits");
        expect(third.body["clearbit/prospected_at"].value).to.not.be.null;

        expect(fourth.type).to.equal("traits");
        expect(fourth.body.email.value).to.equal("foo@foo.bar");
        expect(fourth.body["clearbit/prospected_at"].value).to.not.be.null;
        expect(fourth.body["clearbit/prospected_from"].value).to.equal("abc");
        expect(fourth.body["clearbit/source"].value).to.equal("prospector");
        clearbit.done();
        done();
      }
    );
  });

  it("should respect limit setup", done => {
    const connector = {
      id: "123456789012345678901234",
      private_settings: {
        api_key: "123",
        prospect_enabled: true,
        prospect_segments: ["1"],
        prospect_filter_titles: ["foo", "bar", "zyx"],
        prospect_limit_count: 2
      }
    };
    mocks.minihull.stubConnector(connector);

    nock("https://prospector.clearbit.com")
      .get("/v1/people/search")
      .query({
        domain: "foo.bar",
        limit: 2,
        email: true,
        title: "foo"
      })
      .reply(200, [{ email: "foo@foo.bar" }])
      .get("/v1/people/search")
      .query({
        domain: "foo.bar",
        limit: 1,
        email: true,
        title: "bar"
      })
      .reply(200, [{ email: "foo@bar.bar" }]);

    const thirdTitleCall = nock("https://prospector.clearbit.com")
      .get("/v1/people/search")
      .query({
        domain: "foo.bar",
        limit: 2,
        email: true,
        title: "zyx"
      })
      .reply(200, [{ email: "foo@zyx.bar" }]);

    mocks.minihull.stubApp("/api/v1/search/user_reports").respond({
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

    mocks.minihull.userUpdate(
      {
        connector,
        messages: [
          {
            user: { id: "abc", domain: "foo.bar" },
            account: {},
            segments: [{ id: "1" }]
          }
        ]
      },
      batch => {
        const [first, second, third, fourth, fifth] = batch;
        expect(batch.length).to.equal(5);

        // Clearbit Prospector Triggered
        expect(first.type).to.equal("track");
        expect(first.body.properties.emails[0]).to.equal("foo@foo.bar");
        expect(first.body.properties.emails[1]).to.equal("foo@bar.bar");
        expect(first.body.properties.found).to.equal(2);
        expect(first.body.event).to.equal("Clearbit Prospector Triggered");

        // Source user trait
        expect(second.type).to.equal("traits");
        expect(second.body["clearbit/prospected_at"].value).to.not.be.null;

        // Accounts trait
        expect(third.type).to.equal("traits");
        expect(third.body["clearbit/prospected_at"].value).to.not.be.null;

        // Setting traits on first prospected email
        expect(fourth.type).to.equal("traits");
        expect(fourth.body.email.value).to.equal("foo@foo.bar");
        expect(fourth.body["clearbit/prospected_at"].value).to.not.be.null;
        expect(fourth.body["clearbit/prospected_from"].value).to.equal("abc");
        expect(fourth.body["clearbit/source"].value).to.equal("prospector");

        // Setting traits on second prospected email
        expect(fifth.type).to.equal("traits");
        expect(fifth.body.email.value).to.equal("foo@bar.bar");
        expect(fifth.body["clearbit/prospected_at"].value).to.not.be.null;
        expect(fifth.body["clearbit/prospected_from"].value).to.equal("abc");
        expect(fifth.body["clearbit/source"].value).to.equal("prospector");

        expect(thirdTitleCall.isDone()).to.equal(false);
        done();
      }
    );
  });

  // it("should handle Rate limit error", done => {
  //   nock("https://prospector.clearbit.com")
  //     .get("/v1/people/search")
  //     .query({
  //       domain: "foo.bar",
  //       limit: 2,
  //       email: true,
  //       title: "foo"
  //     })
  //     .reply(200, [{ email: "foo@foo.bar" }])
  //     .get("/v1/people/search")
  //     .query({
  //       domain: "foo.baz",
  //       limit: 2,
  //       email: true,
  //       title: "foo"
  //     })
  //     .reply(409, { error: { message: "Your account is over it's quota" } });
  //
  //   mocks.minihull.stubApp("/api/v1/search/user_reports").respond({
  //     pagination: { total: 0 },
  //     aggregations: {
  //       without_email: {
  //         doc_count: 0
  //       },
  //       by_source: {
  //         buckets: []
  //       }
  //     }
  //   });
  //   mocks.minihull.userUpdate(
  //     {
  //       connector: {
  //         id: "123456789012345678901234",
  //         private_settings: {
  //           api_key: "123",
  //           prospect_enabled: true,
  //           prospect_segments: ["1"],
  //           prospect_filter_titles: ["foo"],
  //           prospect_limit_count: 2
  //         }
  //       },
  //       messages: [
  //         {
  //           user: {
  //             id: "abc",
  //             domain: "foo.bar"
  //           },
  //           segments: [{ id: "1" }]
  //         },
  //         {
  //           user: {
  //             id: "def",
  //             domain: "foo.baz"
  //           },
  //           segments: [{ id: "1" }]
  //         }
  //       ]
  //     },
  //     batch => {
  //       expect(batch.length).to.equal(4);
  //     }
  //   );
  // });
});
