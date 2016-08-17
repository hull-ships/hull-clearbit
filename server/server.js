import express from "express";
import path from "path";
import devMode from "./dev-mode";

import handleProspect from "./handlers/prospect";
import handleUserUpdate from "./handlers/user-update";
import handleBatchUpdate from "./handlers/batch-update";
import handleClearbitWebhook from "./handlers/clearbit-webhook";

import bodyParser from "body-parser";

module.exports = function Server(options = {}) {
  const { devMode: dev, port, Hull, hostSecret, onMetric } = options;
  const { BatchHandler, NotifHandler, Routes, Middleware: hullClient } = Hull;

  const app = express();

  if (dev) app.use(devMode());

  app.use(express.static(path.resolve(__dirname, "..", "dist")));
  app.use(express.static(path.resolve(__dirname, "..", "assets")));

  app.get("/manifest.json", Routes.Manifest(__dirname));
  app.get("/", Routes.Readme);
  app.get("/readme", Routes.Readme);

  function extractToken(req, res, next) {
    req.hull = req.hull || {};
    const token = req.body.id || req.query.id;
    if (!token) {
      return res.json({ error: "unknown id" });
    }
    req.hull.token = token;
    return next();
  }

  app.post("/clearbit",
    bodyParser.json(),
    extractToken,
    hullClient({ hostSecret, onMetric }),
    handleClearbitWebhook(options)
  );

  app.post("/batch", BatchHandler({
    groupTraits: false,
    hostSecret,
    handler: handleBatchUpdate(options)
  }));

  app.post("/prospect",
    bodyParser.urlencoded(),
    Middlewares.hullClient({ hostSecret }),
    handleProspect(options)
  );

  app.post("/notify", NotifHandler({
    groupTraits: false,
    hostSecret,
    onSubscribe: function onSubscribe() {
      console.warn("Hello new subscriber !");
    },
    handlers: {
      "user:update": handleUserUpdate(options)
    }
  }));

  app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    if (err) {
      const data = {
        status: err.status,
        method: req.method,
        headers: req.headers,
        url: req.url,
        params: req.params,
        body: req.body
      };
      console.log("Error ----------------", err.message, err.status, data);
    }

    return res.status(err.status || 500).send({ message: err.message });
  });

  console.log(`Listening on port ${port}`);

  app.listen(port);

  return app;
};
