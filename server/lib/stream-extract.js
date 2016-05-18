import request from 'request';
import JSONStream from 'JSONStream';
import es from 'event-stream';
import Promise from 'bluebird';
import _ from 'lodash';
import Bottleneck from "bottleneck";

export default function(handler) {

  return (req, res, next) => {
    try {
      const { url, format } = req.body || {};
      const { client, ship } = req.hull;
      client.utils.log("batch: ", { url, format });

      function handleUser(user = {}) {
        return handler({ message: { user: client.utils.groupTraits(user) } }, { hull: client, ship, stream: true });
      }

      const limiter = new Bottleneck(5);

      if (handler && url && client && ship && format === 'json') {
        request({ url })
        .pipe(JSONStream.parse())
        .pipe(es.mapSync(function (user) {
          limiter.schedule(handleUser, user);
        }));
        res.status(200);
        res.end('ok');
      } else {
        res.status(400);
        res.send({ reason: 'missing_params' });
        res.end();
      }
    } catch(err) {
      console.warn("Error", err);
      res.status(500);
      res.send({ reason: err.message });
      res.end();
    }

  }
}
