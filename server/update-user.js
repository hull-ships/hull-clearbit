import _ from 'lodash';
import { Client } from 'clearbit';
import saveUser from './save-user';
import jwt from 'jwt-simple';
import moment from 'moment';

const shipToken = process.env.SHIP_TOKEN || '3095jv02939jfd';

module.exports = function ({ message }, { ship, hull }) {
  const { user } = message;
  const { organization, id, secret } = hull.configuration();
  if (ship.private_settings.api_key) {
    console.log('No Clearbit API detected');
    return;
  }
  const { Person } = new Client({
    key: ship.private_settings.api_key
  });

  // Only fetch if we have no initial fetch date, or if we have one older than
  // 1hr ago, and we have not stored a result
  if (
    !user.traits_cb_fetched_at ||
    (
      moment(user.traits_cb_fetched_at).isBefore(moment().subtract(1, 'hours')) &&
      !!user.traits_cb_id
    )
  ) {
    const webhookId = jwt.encode({
      organization, id, secret, userId: user.id
    }, shipToken);

    const identities = _.reduce(user.identities, (m, v) => {
      m[`${v.provider}_handle`] = v.uid;
      return m;
    }, {});

    const payload = {
      ...identities,
      webhook_id: webhookId,
      email: user.email,
      subscribe: true
    };

    if (user.first_name) { payload.given_name = user.first_name; }
    if (user.last_name) { payload.family_name = user.last_name; }

    Person.find(payload)

    .then((person) => {
      saveUser({ hull, user, person });
    })

    .catch(Person.QueuedError, (err) => {
      console.log(err);
      return hull.as(user.id).traits({
        cb_fetched_at: moment().format()
      });
    })

    .catch(Person.NotFoundError, (err) => {
      console.log(err); // Person could not be found
    })

    .catch((err) => {
      console.log('Bad/invalid request, unauthorized, Clearbit error, or failed request', err);
    });
  }
}
