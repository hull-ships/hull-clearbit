const cache = {};
const TTL = 1000 * 900; // 15min

function expired(d) {
  if (!d) { return true; }
  return new Date().getTime() > d + TTL;
}

export default function (hull, endpoint, params = {}) {
  if (!endpoint || !hull) {
    let message = '';
    if (!endpoint) { message += ' No Endpoint'; }
    if (!hull) { message += ' No Hull'; }
    return Promise.reject(new Error(`Invalid Config ${message}`));
  }

  const { organization, userId, id } = hull.configuration();
  const cacheKey = `${organization}-${userId || id || 'app' }-${endpoint}`;
  const cached = cache[cacheKey];

  if (cached && !expired(cached.d)) {
    return Promise.resolve(cached.res);
  }

  return hull.get(endpoint, params).then((res) => {
    cache[cacheKey] = { d: new Date().getTime(), res };
    return res;
  });
}
