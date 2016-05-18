import cache from './hull-cache';
import Hull from 'hull';

function parseConfig(req = {}) {
  const params = {
    organization: ['organization'],
    secret: ['secret'],
    id: ['ship', 'id']
  };
  return Object.keys(params).reduce((cfg, key) => {
    const val =  params[key].reduce((v, k) => { return v || req.params[k] || req.query[k] }, null)
    if (typeof val === 'string') {
      cfg[key] = val.trim();
    } else if (val && val[0] && typeof val[0] === 'string') {
      cfg[key] = val[0].trim();
    }
    return cfg;
  }, {});
}

export default function (req, res, next) {
  const config = parseConfig(req);
  if (config.organization && config.id && config.secret) {
    req.hull = req.hull || {};
    const hull = req.hull.client = new Hull(config);
    cache(hull, config.id).then((ship) => {
      req.hull.ship = ship;
      next();
    }).catch((err) => {
      let msg;
      const status = 400;
      if (typeof message !== 'string') {
        msg = message.toString();
        if (message.stack) {
          console.log(message.stack);
        }
      } else {
        msg = message;
      }
      res.status(status);
      res.end(msg);
    });
  }
}

