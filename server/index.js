import express from 'express';
import bodyParser from 'body-parser';
import path from 'path';
import { NotifHandler } from 'hull';
import readmeRedirect from './lib/readme-redirect-middleware';
import hullDecorator from './lib/hull-decorator';

const hullHandlers = NotifHandler({
  onSubscribe() {
    console.warn('Hello new subscriber !');
  },
  events: {
    'user_report:update': require('./update-user')
  }
});

const clearbitHandlers = hullDecorator({
  onError(err) {
    console.warn('Boom error', err, err.stack);
  },
  handlers: {
    webhooks: require('./clearbit-webhooks.js')
  }
});

module.exports = function (config = {}) {
  const app = express();

  app.use(bodyParser.urlencoded({ extended: false }));
  app.use(bodyParser.json());
  app.use(express.static(path.resolve(__dirname, '..', 'dist')));
  app.use(express.static(path.resolve(__dirname, '..', 'assets')));
  app.post('/notify', hullHandlers);
  app.post('/clearbit', clearbitHandlers.webhooks);

  app.use(express.static(path.resolve(__dirname, '..', 'dist')));
  app.use(express.static(path.resolve(__dirname, '..', 'assets')));

  app.get('/', readmeRedirect);
  app.get('/readme', readmeRedirect);

  app.get('/manifest.json', (req, res) => {
    res.sendFile(path.resolve(__dirname, '..', 'manifest.json'));
  });

  app.listen(config.port);

  console.log(`Started on port ${config.port}`);

  return app;
}
