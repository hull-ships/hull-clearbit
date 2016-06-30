import express from "express";
import path from "path";
import Clearbit from "./clearbit";
import bodyParser from 'body-parser'

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
    console.warn("Voici mon token: ", req.body.id);
    console.warn("Voici hull: ", req.hull);
    req.hull.token = req.body.id;
    next();
  }

  app.post("/clearbit",
    bodyParser.json(),
    extractToken,
    Middlewares.hullClient({ hostSecret }),
    Clearbit.handleWebhook
  )

  app.post("/batch", BatchHandler({
    groupTraits: false,
    handler: Clearbit.handleBatchUpdate(options)
  }));

  app.post("/notify", NotifHandler({
    groupTraits: false,
    onSubscribe: function onSubscribe() {
      console.warn("Hello new subscriber !");
    },
    handlers: {
      "user:update": Clearbit.handleUserUpdate(options)
    }
  }));

  Hull.log(`Listening on port ${port}`);

  app.listen(port);

  return app;
};
