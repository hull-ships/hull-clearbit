import bodyParser from "body-parser";
import { notifHandler, smartNotifierHandler } from "hull/lib/utils";
import Hull from "hull";

import devMode from "./dev-mode";
import handleProspect from "./actions/prospect";
import handleUserUpdate from "./actions/user-update";
import handleBatchUpdate from "./actions/batch-update";
import handleClearbitWebhook from "./actions/clearbit-webhook";
import statusCheck from "./actions/status";

module.exports = function Server(app, options = {}) {
  const { hostSecret } = options;

  if (options.devMode) app.use(devMode());

  app.post("/clearbit", bodyParser.json(), (req, res, next) => {
    Hull.logger.debug("clearbit.webhook.payload", {
      query: req.query,
      body: req.body
    });
    next();
  }, handleClearbitWebhook(options));

  app.post(
    "/clearbit-enrich",
    bodyParser.json(),
    handleClearbitWebhook(options)
  );

  app.post("/batch", notifHandler({
    hostSecret,
    userHandlerOptions: {
      groupTraits: false,
      maxSize: 100,
      maxTime: 120
    },
    handlers: {
      "user:update": handleBatchUpdate(options)
    }
  }));

  app.post(
    "/prospect",
    bodyParser.urlencoded(),
    handleProspect(options)
  );

  app.post("/notify", notifHandler({
    userHandlerOptions: {
      groupTraits: false,
      maxSize: 1,
      maxTime: 1
    },
    handlers: {
      "user:update": handleUserUpdate(options)
    }
  }));

  app.post("/smart-notifier", smartNotifierHandler({
    handlers: {
      "user:update": handleUserUpdate(options)
    }
  }));

  app.all("/status", statusCheck);

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
      console.log("Error ----------------", err.message, err.status, err.stack, data);
    }

    return res.status(err.status || 500).send({ message: err.message });
  });

  return app;
};
