import Minihull from "minihull";
import Hull from "hull";
import Server from "../../../server/server";

module.exports = function bootstrap({ beforeEach, afterEach, port, segments }) {
  const mocks = {};
  beforeEach(done => {
    const minihull = new Minihull();
    minihull.listen(8001).then(done);
    minihull.stubSegments(segments);
    mocks.firehose = "firehose";
    const server = Server({
      hostSecret: "1234",
      skipSignatureValidation: true,
      Hull,
      port,
      clientConfig: {
        flushAt: 1,
        protocol: "http",
        firehoseUrl: "http://localhost:8001/firehose"
      }
    });
    mocks.minihull = minihull;
    mocks.server = server;
  });

  afterEach(() => {
    mocks.minihull.close();
    mocks.server.close();
  });

  return mocks;
};
