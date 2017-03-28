import Clearbit from "../clearbit";

export default function handleUserUpdate({ hostSecret, stream = false, onMetric }) {
  return ({ client, ship, hostname }, messages) => {
    const clearbit = new Clearbit({
      hull: client, ship, hostSecret, stream, onMetric, hostname
    });

    messages.forEach(message => {
      const { user } = message;

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
    });
  };
}
