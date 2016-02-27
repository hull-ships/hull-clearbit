import connect from 'connect';
import _ from 'lodash';
import hullMiddleware from './hull-middleware';
import errorMiddleware from './error-middleware';

export default function (options = {}) {
  const { handlers } = options;

  return _.reduce(handlers, (h, v, k) => {
    const app = connect();
    app.use(errorMiddleware(options.onError));
    app.use(hullMiddleware);
    app.use(v);
    app.use((req, res) => { res.end('ok'); });
    h[k] = function handler(req, res) {
      return app.handle(req, res);
    };
    return h;
  }, {});
}
