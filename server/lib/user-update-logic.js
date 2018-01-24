export default function userUpdateLogic({ message = {}, clearbit, client }) {
  const { segments, user, account } = message;
  const acc = account || user.account;

  client.asUser(user).logger.info("outgoing.user.start");
  if (clearbit.canEnrich(user)) {
    if (clearbit.shouldEnrich(message)) {
      return clearbit.enrichUser(user);
    }
  }

  if (clearbit.canReveal(user)) {
    if (clearbit.shouldReveal(message)) {
      return clearbit.revealUser(user);
    }
  }

  if (clearbit.shouldDiscover(message)) {
    return clearbit.discoverSimilarCompanies(user);
  }

  if (clearbit.shouldProspect({ segments, user, account: acc })) {
    return clearbit.prospectUsers(user, acc);
  }

  client
    .asUser(user)
    .logger.info("outgoing.user.skip", { reason: "no action matched" });

  return false;
}
