export default function userUpdateLogic({ message = {}, clearbit, client }) {
  const { user } = message;

  if (clearbit.canEnrich(user)) {
    client.asUser(user).logger.info("outgoing.user.start", { action: "shouldEnrich" });
    if (clearbit.shouldEnrich(message)) {
      return clearbit.enrichUser(user);
    }
  }

  if (clearbit.canReveal(user)) {
    client.asUser(user).logger.info("outgoing.user.start", { action: "shouldReveal" });
    if (clearbit.shouldReveal(message)) {
      return clearbit.revealUser(user);
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
}
