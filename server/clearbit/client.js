import { Client } from "clearbit";
import request from "request";
import qs from "qs";
import Promise from "bluebird";
import { STATUS_CODES } from "http";


function ClearbitApi({ path, method = "get", params = {}, key }) {
  const baseUrl = `https://prospector.clearbit.com/v1${path}`;
  const url = `${baseUrl}?${qs.stringify(params, { arrayFormat: "brackets" })}`;
  return new Promise((resolve, reject) => {
    request(url, {
      method,
      headers: {
        "content-type": "application/json",
        "accept": "application/json"
      },
      auth: { bearer: key }
    }, (error, response, rawBody) => {
      let body;

      try {
        body = JSON.parse(rawBody);
      } catch (err) {
        body = {};
      }

      if (error) {
        reject(error);
      } else if (response.statusCode === 202 || response.statusCode >= 400) {
        const message = body.error ? body.error.message : STATUS_CODES[response.statusCode] || "Unknown";
        reject(new Error(message));
      } else {
        try {
          resolve(body);
        } catch (err) {
          reject(err);
        }
      }
    });
  });
}

export default class ClearbitClient {
  constructor(key, onMetric, onLog) {
    this.key = key;
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
    this.metric("clearbit.enrich");
    this.log("outgoing.user.start", { params, source: "enrich" });
    return this.client.Enrichment.find(params).catch(
      this.client.Enrichment.QueuedError,
      this.client.Enrichment.NotFoundError,
      () => { return {}; }
    );
  }

  reveal(params) {
    this.metric("clearbit.reveal");
    this.log("outgoing.user.start", { params, source: "reveal" });
    return this.client.Reveal.find(params);
  }

  discover(params) {
    this.metric("clearbit.discover");
    this.log("outgoing.user.start", { params, source: "discover" });
    return this.client.Discovery.search(params);
  }

  prospect(params) {
    this.metric("clearbit.prospect");
    this.log("outgoing.user.start", { params, source: "prospect" });
    return ClearbitApi({ path: "/people/search", params, key: this.key });
  }
}
