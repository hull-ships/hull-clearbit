const Connector = require("hull").Connector;
const express = require("express");

const server = require("../../../server/server");

module.exports = function bootstrap(port) {
  const app = express();
  const connector = new Connector({ hostSecret: "1234", port, clientConfig: { protocol: "http" } });
  connector.setupApp(app);
  server(app);

  return connector.startApp(app);
};
