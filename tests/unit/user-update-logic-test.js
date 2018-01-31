/* eslint-env node, mocha */
const assert = require("assert");
const sinon = require("sinon");
const moment = require("moment");
const Clearbit = require("../../server/clearbit").default;
const userUpdateLogic = require("../../server/lib/user-update-logic").default;

describe("User Update Logic", () => {
  const makeHull = () => {
    const mock = {};
    mock.logger = { info: () => {} };
    mock.traits = sinon.spy(() => Promise.resolve());
    mock.asUser = sinon.spy(() => mock);
    return mock;
  };

  const makeClearbit = (private_settings = {}) => {
    const client = makeHull();
    const clearbit = new Clearbit({ ship: { private_settings }, hull: client });
    const revealSpy = sinon.spy();
    const enrichSpy = sinon.spy();
    const similarSpy = sinon.spy();
    const prospectSpy = sinon.spy();
    clearbit.revealUser = revealSpy;
    clearbit.enrichUser = enrichSpy;
    clearbit.discoverSimilarCompanies = similarSpy;
    clearbit.prospectUser = prospectSpy;
    clearbit.client = {};
    return { client, clearbit, revealSpy, enrichSpy, similarSpy, prospectSpy };
  };

  it("should not do anything if nothing enabled", () => {
    const cb = makeClearbit({
      enrich_segments: ["1"],
      enrich_enabled: false,
      reveal_segments: ["1"],
      reveal_enabled: false
    });
    const message = {
      user: { last_known_ip: "1.2.3.4", email: "foo@bar.com" },
      segments: [{ id: "1" }]
    };
    userUpdateLogic({ message, clearbit: cb.clearbit, client: cb.client });
    assert(cb.revealSpy.notCalled);
    assert(cb.enrichSpy.notCalled);
    assert(cb.similarSpy.notCalled);
    assert(cb.prospectSpy.notCalled);
  });

  it("should reveal anonymous Users", () => {
    const cb = makeClearbit({
      enrich_segments: ["1"],
      enrich_enabled: true,
      reveal_segments: ["1"],
      reveal_enabled: true
    });
    const message = {
      user: { last_known_ip: "1.2.3.4", email: undefined },
      segments: [{ id: "1" }]
    };
    userUpdateLogic({ message, clearbit: cb.clearbit, client: cb.client });
    assert(cb.revealSpy.called);
    assert(cb.enrichSpy.notCalled);
    assert(cb.similarSpy.notCalled);
    assert(cb.prospectSpy.notCalled);
  });

  it("should enrich Users with an email, but not reveal them", () => {
    const cb = makeClearbit({
      enrich_segments: ["1"],
      enrich_enabled: true,
      reveal_segments: ["1"],
      reveal_enabled: true
    });
    const message = {
      user: { last_known_ip: "1.2.3.4", email: "foo@bar.com" },
      segments: [{ id: "1" }]
    };
    userUpdateLogic({ message, clearbit: cb.clearbit, client: cb.client });
    assert(cb.revealSpy.notCalled);
    assert(cb.enrichSpy.called);
    assert(cb.similarSpy.notCalled);
    assert(cb.prospectSpy.notCalled);
  });

  it("should not reveal Users with a company", () => {
    const cb = makeClearbit({
      enrich_segments: ["1"],
      enrich_enabled: true,
      reveal_segments: ["1"],
      reveal_enabled: true
    });
    const message = {
      user: {
        last_known_ip: "1.2.3.4",
        "traits_clearbit_company/id": "1234"
      },
      segments: [{ id: "1" }]
    };
    userUpdateLogic({ message, clearbit: cb.clearbit, client: cb.client });
    assert(cb.revealSpy.notCalled);
    assert(cb.enrichSpy.notCalled);
    assert(cb.similarSpy.notCalled);
    assert(cb.prospectSpy.notCalled);
  });

  it("should not do anything for already enriched users", () => {
    const cb = makeClearbit({
      enrich_segments: ["1"],
      enrich_enabled: true,
      reveal_segments: ["1"],
      reveal_enabled: true
    });
    const message = {
      user: {
        last_known_ip: "1.2.3.4",
        email: "foo@bar.com",
        "traits_clearbit/id": "1234"
      },
      segments: [{ id: "1" }]
    };
    userUpdateLogic({ message, clearbit: cb.clearbit, client: cb.client });
    assert(cb.revealSpy.notCalled);
    assert(cb.enrichSpy.notCalled);
    assert(cb.similarSpy.notCalled);
    assert(cb.prospectSpy.notCalled);
  });

  it("should not do anything for users without a match", () => {
    const cb = makeClearbit({
      enrich_segments: ["1"],
      enrich_enabled: true,
      reveal_segments: ["1"],
      reveal_enabled: true
    });
    const message = {
      user: {
        last_known_ip: "1.2.3.4",
        email: "foo@bar.com",
        "traits_clearbit/enriched_at": "1234"
      },
      segments: [{ id: "1" }]
    };
    userUpdateLogic({ message, clearbit: cb.clearbit, client: cb.client });
    assert(cb.revealSpy.notCalled);
    assert(cb.enrichSpy.notCalled);
    assert(cb.similarSpy.notCalled);
    assert(cb.prospectSpy.notCalled);
  });

  it("should enrich Revealed Users without enrichment data", () => {
    const cb = makeClearbit({
      enrich_segments: ["1"],
      enrich_enabled: true,
      reveal_segments: ["1"],
      reveal_enabled: true
    });
    const message = {
      user: {
        last_known_ip: "1.2.3.4",
        email: "foo@bar.com",
        "traits_clearbit/revealed_at": moment().format(),
        "traits_clearbit_company/id": "1234"
      },
      segments: [{ id: "1" }]
    };
    userUpdateLogic({ message, clearbit: cb.clearbit, client: cb.client });
    assert(cb.revealSpy.notCalled);
    assert(cb.enrichSpy.called);
    assert(cb.similarSpy.notCalled);
    assert(cb.prospectSpy.notCalled);
  });

  it("should not enrich or Reveale Users with Enrichment data", () => {
    const cb = makeClearbit({
      enrich_segments: ["1"],
      enrich_enabled: true,
      reveal_segments: ["1"],
      reveal_enabled: true
    });
    const message = {
      user: {
        last_known_ip: "1.2.3.4",
        email: "foo@bar.com",
        "traits_clearbit/enriched_at": moment().format(),
        "traits_clearbit/revealed_at": moment().format(),
        "traits_clearbit_company/id": "1234"
      },
      segments: [{ id: "1" }]
    };
    userUpdateLogic({ message, clearbit: cb.clearbit, client: cb.client });
    assert(cb.revealSpy.notCalled);
    assert(cb.enrichSpy.notCalled);
    assert(cb.similarSpy.notCalled);
    assert(cb.prospectSpy.notCalled);
  });
});
