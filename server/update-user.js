import _ from 'lodash';
import { Client } from 'clearbit';
import saveUser from './save-user';
import jwt from 'jwt-simple';
import moment from 'moment';

const shipToken = process.env.SHIP_TOKEN || '3095jv02939jfd';

module.exports = function ({ message={} }, { ship, hull }) {
  const { organization, id, secret } = hull.configuration();
  const { user={} } = message;
  const { first_name, last_name, email, id: userId, identities={}, cb={} } = user;
  const { id: cbId , fetched_at } = cb;
  const one_hour_ago = moment().subtract(1, 'hours');
  const { api_key, excluded_domains="" } = ship.private_settings;
  const skip_search = _.includes(_.map((excluded_domains.split(',')||[]),(d)=>d.trim()), email.split('@')[1]|'');

  if (!api_key) {
    console.log('No Clearbit API key detected');
    return;
  }

  const { Person } = new Client({ key: api_key });

  // Only fetch if we have no initial fetch date, or if we have one older than
  // 1hr ago, and we have not stored a result

  if (true || !fetched_at || (moment(fetched_at).isBefore(one_hour_ago) && !!cbId)) {
    const webhookId = jwt.encode({ organization, id, secret, userId }, shipToken);

    const identities = _.reduce(identities, (m, v) => {
      m[`${v.provider}_handle`] = v.uid;
      return m;
    }, {});

    const payload = {
      ...identities,
      webhook_id: webhookId,
      email: email,
      subscribe: true
    };

    // More data for Clearbit to find user if we have it.
    if (first_name) { payload.given_name = first_name; }
    if (last_name)  { payload.family_name = last_name; }

    Person.find(payload)

    .then((person) => {
      saveUser({ hull, user, person });
    })

    .catch(Person.QueuedError, (err) => {
      console.log(err);
      return hull.as(userId).traits({ fetched_at: moment().format() }, { source: 'cb' });
    })

    .catch(Person.NotFoundError, (err) => {
      console.log(err); // Person could not be found
    })

    .catch((err) => {
      console.log('Bad/invalid request, unauthorized, Clearbit error, or failed request', err);
    });
  }
}
