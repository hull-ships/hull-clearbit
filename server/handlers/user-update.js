import Clearbit from "../clearbit";

export default function handleUserUpdate({ hostSecret, stream = false, onMetric }) {
  return ({ client, ship, hostname }, messages) => {
    const clearbit = new Clearbit({
      hull: client, ship, hostSecret, stream, onMetric, hostname
    });

    messages.forEach(message => {
      const { user } = message;

      if (clearbit.canReveal(user)) {
        client.asUser(user).logger.info("outgoing.user.start", { action: "shouldReveal" });
        if (clearbit.shouldReveal(message)) {
          return clearbit.revealUser(user);
        }
      }

      if (clearbit.canEnrich(user)) {
        client.asUser(user).logger.info("outgoing.user.start", { action: "shouldEnrich" });
        if (clearbit.shouldEnrich(message)) {
          return clearbit.enrichUser(user);
        }
      }

      if (clearbit.shouldDiscover(message)) {
        client.asUser(user).logger.info("outgoing.user.start", { action: "shouldDiscover" });
        return clearbit.discoverSimilarCompanies(user);
      }

      if (clearbit.shouldProspect(message)) {
        client.asUser(user).logger.info("outgoing.user.start", { action: "shouldProspect" });
        return clearbit.prospectUsers(user);
      }

      return false;
    });
  };
}
