import _ from 'lodash';
import mapper from 'object-mapper'
import MAPPING from './clearbit-mapping';

export default function({ hull, user = {}, person = {} }) {
  const { id: shipId } = hull.configuration();
  const mapping = _.reduce(MAPPING, (map, key, val) => {
    return Object.assign(map, {
      [val]: {
        key,
        transform: (v) => {
          // Replace the key to build an accessor compatible with lodash's _.get
          // address.city -> address_city
          // name -> name
          // clearbit/foo -> clearbit.foo
          const accessor = key.replace('.', '_').replace('/', '.');
          const userVal = _.get(user, accessor);

          // Return early is undefined
          if (_.isUndefined(v)) return;

          // Only return the value if :
          // - it's a user property and it's undefined
          if (_.isUndefined(userVal)) return v;

          // - it's a clearbit trait and it has changed
          if (key.match(/^clearbit/) && userVal !== v) {
            return v
          }
        }
      }
    });
  }, {})

  const traits = mapper.merge(person, {}, mapping);

  if (!_.isEmpty(traits)) {
    hull.utils.log("[user.traits]", user.id, JSON.stringify(traits));
    traits['clearbit/fetched_at'] = new Date().toISOString();
    return hull.as(user.id).traits(traits);
  } else {
    hull.utils.log("[user.skip] no changes", user.id, JSON.stringify({ person, user }));
  }

}
