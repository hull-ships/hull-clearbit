import Clearbit from "../clearbit";

export default function handleUserUpdate({ hostSecret, stream = false, forceFetch = false, onMetric }) {
  return (payload, { hull, ship, req }) => {
    const { user = {}, segments = [], changes = {} } = payload.message;
    const { hostname } = req;
    const cb = new Clearbit({
      hull, ship, hostSecret, stream, forceFetch, onMetric, hostname
    });

    if (!cb.shouldEnrich({ user, segments, changes })) {
      const { id, name, email } = user;
      cb.log("skipEnrich for", { id, name, email });
      return false;
    }

    return cb
      .enrichUser(user)
      .then((enriched = {}) => {
        const { person } = enriched;
        const shouldProspect = cb.shouldProspect({ user, segments });
        if (person && shouldProspect) {
          const filters = cb.getFilterProspectOptions();
          return cb.findSimilarPersons(person, filters);
        }
        return person;
      }
    );
  };
}
