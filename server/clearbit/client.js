import { Client } from "clearbit";

export default class ClearbitClient {
  constructor(key, onMetric, hull) {
    this.key = key;
    this.client = new Client({ key });
    this.onMetric = onMetric;
    this.hull = hull;
  }

  metric(metric, value = 1) {
    if (this.onMetric) {
      this.onMetric(metric, value);
    }
  }

  enrich(params) {
    this.metric("clearbit.enrich");
    this.hull.logger.debug("outgoing.user.start", { params, source: "enrich" });
    this._metric.increment("ship.service_api.call", 1);
    return this.client.Enrichment.find(params).catch(
      this.client.Enrichment.QueuedError,
      this.client.Enrichment.NotFoundError,
      () => { return {}; }
    );
  }

  reveal(params) {
    this.metric("clearbit.reveal");
    this.hull.logger.debug("outgoing.user.start", { params, source: "reveal" });
    this._metric.increment("ship.service_api.call", 1);
    return this.client.Reveal.find(params);
  }

  discover(params) {
    this.metric("clearbit.discover");
    this.hull.logger.debug("outgoing.user.start", { params, source: "discover" });
    this._metric.increment("ship.service_api.call", 1);
    return this.client.Discovery.search(params);
  }

  prospect(params, asUser) {
    this.metric("clearbit.prospect");
    (asUser || this.hull).logger.debug("outgoing.user.start", { params, source: "prospect" });
    this._metric.increment("ship.service_api.call", 1);
    return this.client.Prospector.search(params);
  }
}
