import { Client } from "clearbit";

export default class ClearbitClient {
  constructor(key, onMetric, onLog) {
    this.client = new Client({ key });
    this.onMetric = onMetric;
    this.onLog = onLog;
  }

  metric(metric, value = 1) {
    if (this.onMetric) {
      this.onMetric(metric, value);
    }
  }

  log(msg, data) {
    if (this.onLog) {
      this.onLog(msg, data);
    }
  }

  enrich(params) {
    this.metric("enrich");
    this.log("enrich", JSON.stringify(params));
    const { Enrichment } = this.client;
    return Enrichment.find(params).catch(
      Enrichment.QueuedError,
      Enrichment.NotFoundError,
      () => { return {}; }
    );
  }

  reveal(params) {
    this.metric("clearbit.reveal");
    this.log("clearbit.reveal", JSON.stringify(params));
    return this.client.Reveal.find(params);
  }

  discover(params) {
    this.metric("clearbit.discover");
    this.log("clearbit.discover", JSON.stringify(params));
    return this.client.Discovery.search(params);
  }

  prospect(params) {
    this.metric("clearbit.prospect");
    this.log("clearbit.prospect", JSON.stringify(params));
    return this.client.Prospector.search(params);
  }
}
