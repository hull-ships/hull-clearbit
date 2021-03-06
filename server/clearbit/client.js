import { Client } from "clearbit";
import request from "request";
import qs from "qs";
import Promise from "bluebird";
import { STATUS_CODES } from "http";

const PROSPECTOR_API_VERSION = "2018-06-06";

function ClearbitApi({ path, method = "get", params = {}, key, versioning }) {
  const baseUrl = `https://prospector.clearbit.com/v1${path}`;
  const url = `${baseUrl}?${qs.stringify(params, { arrayFormat: "brackets" })}`;
  return new Promise((resolve, reject) => {
    request(
      url,
      {
        method,
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          "API-Version": versioning
        },
        auth: { bearer: key }
      },
      (error, response, rawBody) => {
        let body;

        try {
          body = JSON.parse(rawBody);
        } catch (err) {
          body = {};
        }
        if (error) {
          reject(error);
        } else if (response.statusCode === 202 || response.statusCode >= 400) {
          const message = body.error
            ? body.error.message
            : STATUS_CODES[response.statusCode] || "Unknown";
          reject(new Error(message));
        } else {
          try {
            resolve(body);
          } catch (err) {
            reject(err);
          }
        }
      }
    );
  });
}

export default class ClearbitClient {
  constructor(key, metric, hull) {
    this.key = key;
    this.client = new Client({ key });
    this.metric = metric;
    this.hull = hull;
  }

  enrich(params) {
    this.hull.logger.debug("clearbit.start", { params, action: "enrich" });
    this.metric("ship.service_api.call", 1, ["ship_action:clearbit:enrich"]);
    return this.client.Enrichment.find(params).catch(
      this.client.Enrichment.QueuedError,
      this.client.Enrichment.NotFoundError,
      () => {
        return {};
      }
    );
  }

  enrichCompany(params) {
    this.hull.logger.debug("clearbit.start", {
      params,
      action: "enrichCompany"
    });
    this.metric("ship.service_api.call", 1, [
      "ship_action:clearbit:enrichCompany"
    ]);
    return this.client.Company.find(params).catch(
      this.client.Company.QueuedError,
      this.client.Company.NotFoundError,
      () => {
        return {};
      }
    );
  }

  reveal(params) {
    this.hull.logger.debug("clearbit.start", { params, action: "reveal" });
    this.metric("ship.service_api.call", 1, ["ship_action:clearbit:reveal"]);
    return this.client.Reveal.find(params);
  }

  discover(params) {
    this.hull.logger.debug("clearbit.start", { params, action: "discover" });
    this.metric("ship.service_api.call", 1, ["ship_action:clearbit:discover"]);
    return this.client.Discovery.search(params);
  }

  prospect(params, asUser) {
    this.metric("clearbit.prospect");
    (asUser || this.hull).logger.debug("clearbit.start", {
      params,
      action: "prospect"
    });
    this.metric("ship.service_api.call", 1, ["ship_action:clearbit:prospect"]);
    return ClearbitApi({
      path: "/people/search",
      params,
      key: this.key,
      versioning: PROSPECTOR_API_VERSION
    });
  }
}
