import _ from 'lodash';
import map from './clearbit-mapping';
import moment from 'moment';

export default function({ hull, user = {}, person = {} }) {
  const { props, clearbit } = map(person);
  clearbit.fetched_at = moment().format();
  const hullUser = hull.as(user.id);
  const userProps = _.omit(props, _.keys(user));
  hullUser.traits(clearbit, { source: 'clearbit' });
  // Update user, skipping properties that already exist.
  return hullUser.put('me', userProps);
}
