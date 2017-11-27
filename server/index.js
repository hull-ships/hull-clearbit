import Hull from "hull";
import { Cache } from "hull/lib/infra";
import express from "express";

import server from "./server";

let onMetric = function onMetric(metric, value, ctx) {
  console.log(`[${ctx.id}] clearbit.${metric}`, value);
};

const librato = require("librato-node");

if (process.env.LIBRATO_TOKEN && process.env.LIBRATO_USER) {
  librato.configure({
    email: process.env.LIBRATO_USER,
    token: process.env.LIBRATO_TOKEN
  });
  librato.on("error", function onError(err) {
    console.error(err);
  });

  process.once("SIGINT", function onSigint() {
    librato.stop(); // stop optionally takes a callback
  });
  librato.start();

  onMetric = function onMetricProduction(metric = "", value = 1, ctx = {}) {
    try {
      if (librato) {
        librato.measure(`clearbit.${metric}`, value, Object.assign({}, { source: ctx.id }));
      }
    } catch (err) {
      console.warn("error in librato.measure", err);
    }
  };
}

if (process.env.LOG_LEVEL) {
  Hull.logger.transports.console.level = process.env.LOG_LEVEL;
}

const cache = new Cache({
  store: "memory",
  max: process.env.SHIP_CACHE_MAX || 100,
  ttl: process.env.SHIP_CACHE_TTL || 60
});

function extractToken(req, res, next) {
  req.hull = req.hull || {};
  const token = req.query.id;
  req.hull.token = token;
  return next();
}

const options = {
  hostSecret: process.env.SECRET || "1234",
  devMode: process.env.NODE_ENV === "development",
  port: process.env.PORT || 8082,
  onMetric,
  clientConfig: {
    firehoseUrl: process.env.OVERRIDE_FIREHOSE_URL
  },
  cache
};

const connector = new Hull.Connector(options);
const app = express();
app.use(extractToken);
connector.setupApp(app);
server(app, options);
connector.startApp(app);
