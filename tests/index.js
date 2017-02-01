/* eslint-env node, mocha */

require("babel-register")({ presets: ["es2015", "stage-0"] });
const assert = require("assert");
const _ = require("lodash");

const Clearbit = require("../server/clearbit").default;
const { getUserTraitsFromPerson } = require("../server/clearbit/mapping");
const { isValidIpAddress } = require("../server/clearbit/utils");

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
});
