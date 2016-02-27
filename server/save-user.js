import _ from 'lodash';
import map from './clearbit-mapping';
import moment from 'moment';

export default function({ hull, user = {}, person = {} }) {
  const { props, traits } = map(person);
  traits.cb_fetched_at = moment().format();
  const hullUser = hull.as(user.id);
  return hullUser
  .put('me', _.omit(props, _.keys(user)))
  .then(() => {
    hullUser.traits(traits);
  });
}
