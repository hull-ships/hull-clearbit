/* eslint-env node, mocha */

require("babel-register")({ presets: ["es2015", "stage-0"] });
const assert = require("assert");
const _ = require("lodash");
const { getUserTraitsFromPerson } = require("../server/clearbit/mapping");

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
    const rank = _.get(reveal, "company.metrics.alexaGlobalRank");
    assert.equal(rank, 30726);
    assert.equal(traits["clearbit_company/metrics_alexa_global_rank"], rank);
  });
});
