import express from "express";
import path from "path";

import handleUserUpdate from "./handlers/user-update";
import handleBatchUpdate from "./handlers/batch-update";
import handleClearbitWebhook from "./handlers/clearbit-webhook";

import bodyParser from "body-parser";

module.exports = function Server(options = {}) {
  const { port, Hull, hostSecret } = options;
  const { BatchHandler, NotifHandler, Routes, Middlewares } = Hull;

  const app = express();

  app.use(express.static(path.resolve(__dirname, "..", "assets")));

  app.get("/manifest.json", Routes.Manifest(__dirname));
  app.get("/", Routes.Readme);
  app.get("/readme", Routes.Readme);

  function extractToken(req, res, next) {
    req.hull = req.hull || {};
    const token = req.body.id;
    if (!token) {
      return res.end("unknown id");
    }
    return next();
  }

  app.post("/clearbit",
    bodyParser.json(),
    extractToken,
    Middlewares.hullClient({ hostSecret }),
    handleClearbitWebhook(options)
  );

  app.post("/batch", BatchHandler({
    groupTraits: false,
    handler: handleBatchUpdate(options)
  }));

  app.post("/notify", NotifHandler({
    groupTraits: false,
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

  Hull.log(`Listening on port ${port}`);

  app.listen(port);

  return app;
};
