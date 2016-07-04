import Clearbit from "../clearbit";

export default function handleUserUpdate({ hostSecret, stream = false, forceFetch = false }) {
  return (payload, { hull, ship }) => {
    const { user = {}, segments = [], changes = {} } = payload.message;
    const cb = new Clearbit({
      hull, ship, hostSecret, stream, forceFetch
    });

    if (!cb.shouldEnrich({ user, segments, changes })) {
      const { id, name, email } = user;
      cb.log("skipEnrich for", { id, name, email });
      return false;
    }

    return cb
      .enrichUser(user)
      .then(({ person }) => {
        if (cb.shouldProspect({ user, segments })) {
          const filters = cb.getFilterProspectOptions();
          return cb.findSimilarPersons(person, filters);
        }
        return person;
      }
    );
  };
}
