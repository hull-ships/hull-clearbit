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
          const accessor = key.replace('.', '_').replace('/', '.');
          const userVal = _.get(user, accessor);
          if (_.isUndefined(v)) return;
          if (_.isUndefined(userVal)) return v;
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
    return hull.as(user.id).traits(traits);
  } else {
    hull.utils.log("[user.skip]", user.id);
  }

}
