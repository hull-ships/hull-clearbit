export default function userUpdateLogic({
  message = {},
  handle_accounts,
  clearbit,
  client
}) {
  const { segments, user, account } = message;
  const acc = account || user.account;

  client.asUser(user).logger.info("outgoing.user.start");
  if (handle_accounts) {
    client.asAccount(account).logger.info("outgoing.account.start");
  }
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

  const reason = { reason: "no action matched" };
  client.asUser(user).logger.info("outgoing.user.skip", reason);
  if (handle_accounts) {
    client.asAccount(account).logger.info("outgoing.account.skip", reason);
  }

  return false;
}
