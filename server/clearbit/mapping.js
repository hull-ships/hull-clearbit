import _ from "lodash";
import ObjectMapper from "object-mapper";
import Mappings from "../mappings";

function getMapping(key) {
  return {
    ...Mappings.Company,
    ...Mappings[key]
  };
}

/**
 * Builds the list of traits to apply on the user
 * from data pulled from Clearbit
 * @param  {Object({ user, person })} payload - Hull/User and Clearbit/Person objects
 * @param  {mappings} mappings - mappings to user
 * @return {Object}
 */
export default function getUserTraitsFromPerson(
  { user = {}, person = {} },
  mappingName
) {
  const mappings = getMapping(mappingName);
  const mapping = _.reduce(
    mappings,
    (map, key, val) => {
      return Object.assign(map, {
        [val]: {
          key,
          transform: v => {
            // Replace the key to build an accessor compatible with lodash's _.get
            // address.city -> address_city
            // name -> name
            // clearbit/foo -> clearbit.foo
            const accessor = key.replace(".", "_").replace("/", ".");
            const userVal = _.get(user, accessor);

            // Return early is undefined
            if (_.isUndefined(v)) return undefined;

            // Only return the value if :
            // - it's a user property and it's undefined
            if (_.isUndefined(userVal)) return v;

            // - it's a clearbit trait and it has changed
            if (key.match(/^clearbit/) && userVal !== v) {
              return v;
            }

            return undefined;
          }
        }
      });
    },
    {}
  );

  // Use setIfNull for top level fields
  const traits = _.reduce(
    ObjectMapper.merge(person, {}, mapping),
    (ts, value, key) => {
      const val = key.match(/^clearbit/)
        ? value
        : { operation: "setIfNull", value };
      return { ...ts, [key]: val };
    },
    {}
  );

  // Overcome the value:key restrictions and add last_name and first_name to top level traits
  // if the mappingName is Person
  if (mappingName === "Person") {
    _.set(traits, "last_name", {
      value: _.get(person, "name.familyName"),
      operation: "setIfNull"
    });
    _.set(traits, "first_name", {
      value: _.get(person, "name.givenName"),
      operation: "setIfNull"
    });
  }

  return _.omitBy(traits, _.isNil);
}
