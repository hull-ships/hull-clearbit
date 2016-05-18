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
    console.warn("Hello ", { key, val })
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

  console.warn("Hello Config", config);

  if (config.organization && config.id && config.secret) {
    req.hull = req.hull || {};
    const hull = req.hull.client = new Hull(config);
    const handleError = function (err) { res.handleError(err, 400); };
    cache(hull, config.id).then((ship) => {
      req.hull.ship = ship;
      next();
    }, handleError).catch(handleError);
  } else {
    res.handleError(new Error('Cannot find required credentials to build a Hull instance'), 404);
  }
}

