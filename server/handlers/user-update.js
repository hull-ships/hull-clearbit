import Clearbit from "../clearbit";

export default function handleUserUpdate({ hostSecret, stream = false, onMetric }) {
  return ({ message = {} }, { hull, ship, req }) => {
    const { user = {} } = message;
    const { hostname } = req;
    const clearbit = new Clearbit({
      hull, ship, hostSecret, stream, onMetric, hostname
    });

    if (clearbit.shouldEnrich(message)) {
      return clearbit.enrichUser(user);
    }

    if (clearbit.shouldDiscover(message)) {
      return clearbit.discoverSimilarCompanies(user);
    }

    if (clearbit.shouldProspect(message)) {
      return clearbit.prospectUsers(user);
    }

    return false;
  };
}
