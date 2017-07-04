import devMode from "./dev-mode";
import { notifHandler } from "hull/lib/utils";

import handleProspect from "./handlers/prospect";
import handleUserUpdate from "./handlers/user-update";
import handleBatchUpdate from "./handlers/batch-update";
import handleClearbitWebhook from "./handlers/clearbit-webhook";

import bodyParser from "body-parser";

function extractToken(req, res, next) {
  req.hull = req.hull || {};
  const token = req.query.id;
  req.hull.token = token;
  return next();
}

module.exports = function Server(app, options = {}) {
  const { hostSecret } = options;

  app.use(extractToken);

  if (options.devMode) app.use(devMode());

  app.post("/clearbit",
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

  app.post("/prospect",
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
