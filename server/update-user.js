import _ from 'lodash';
import { Client } from 'clearbit';
import saveUser from './save-user';
import jwt from 'jwt-simple';
import moment from 'moment';

const shipToken = process.env.SHIP_TOKEN || '3095jv02939jfd';

module.exports = function ({ message={} }, { ship, hull, stream = false }) {
  try {
    const { organization, id, secret } = hull.configuration();
    const { user={} } = message;
    const { first_name, last_name, email = '', id: userId, identities={}, clearbit={} } = user;
    const { id: cbId , fetched_at } = clearbit;
    const one_hour_ago = moment().subtract(1, 'hours');
    const { api_key, excluded_domains="" } = ship.private_settings;

    const emailDomain = (email || "").split('@')[1];
    const excludedDomains = excluded_domains.split(',').map(d => d.trim());
    const skippedDomain = _.includes(excludedDomains, emailDomain);


    function log(msg, data) {
      if (data) {
        msg += JSON.stringify(data);
      }
      hull.utils.log(`[userId=${userId}]`, msg);
    }


    if (!api_key) {
      const errorMessage = "No Clearbit API key detected";
      log(errorMessage);
      return Promise.reject(new Error(errorMessage));
    }

    if (!email) {
      log("Skip user - no email");
      return Promise.resolve(user);
    }

    const { Person } = new Client({ key: api_key });

    // Only fetch if we have no initial fetch date, or if we have one older than
    // 1hr ago, and we have not stored a result

    if (!fetched_at || (moment(fetched_at).isBefore(one_hour_ago) && !!cbId && !skippedDomain)) {
      const webhookId = jwt.encode({ organization, id, secret, userId }, shipToken);

      const identities = _.reduce(identities, (m, v) => {
        m[`${v.provider}_handle`] = v.uid;
        return m;
      }, {});

      const payload = {
        ...identities,
        webhook_id: webhookId,
        email: email,
        subscribe: true,
        stream
      };

      // More data for Clearbit to find user if we have it.
      if (first_name) { payload.given_name = first_name; }
      if (last_name)  { payload.family_name = last_name; }

      return Person.find(payload)

      .then((person) => {
        return saveUser({ hull, user, person });
      })

      .catch(Person.QueuedError, (err) => {
        log("User queued");
        const fetched_at = new Date().toISOString();
        return hull.as(userId).traits({ fetched_at }, { source: 'clearbit' });
      })

      .catch(Person.NotFoundError, (err) => {
        log("User not found"); // Person could not be found
        return hull.as(userId).traits({ fetched_at }, { source: 'clearbit' });
      })

      .catch((err) => {
        log('Bad/invalid request, unauthorized, Clearbit error, or failed request', err);
      });

    } else {
      hull.utils.log("Skip user with id = " + user.id);
      return Promise.resolve(user);
    }
  } catch(err) {
    return Promise.reject(err);
  }
}
