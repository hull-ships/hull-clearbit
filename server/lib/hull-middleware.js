import cache from './hull-cache';
import Hull from 'hull';

function parseConfig(params = {}) {
  return ['organization', 'id', 'secret'].reduce((cfg, k) => {
    const val = (params[k] || '').trim();
    if (typeof val === 'string') {
      cfg[k] = val;
    } else if (val && val[0] && typeof val[0] === 'string') {
      cfg[k] = val[0].trim();
    }
    return cfg;
  }, {});
}

export default function (req, res, next) {
  const config = parseConfig(req.params);

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

