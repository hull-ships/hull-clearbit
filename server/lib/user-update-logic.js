export default function userUpdateLogic({
  message = {},
  handle_accounts,
  clearbit,
  client
}) {
  const { segments, user, account } = message;
  const acc = account || user.account;

  const asUser = client.asUser(user);
  asUser.logger.info("outgoing.user.start");
  const skips = {};

  if (handle_accounts) {
    client.asAccount(account).logger.info("outgoing.account.start");
  }
  if (clearbit.canEnrich(user)) {
    const { should, message: msg } = clearbit.shouldEnrich(message);
    if (should) return clearbit.enrichUser(user);
    skips.enrich = msg;
  }

  if (clearbit.canReveal(user)) {
    const { should, message: msg } = clearbit.shouldReveal(message);
    if (should) return clearbit.revealUser(user);
    skips.reveal = msg;
  }

  const {
    should: shouldDiscover,
    message: discoverMessage
  } = clearbit.shouldDiscover(message);
  if (shouldDiscover) return clearbit.discoverSimilarCompanies(user);
  skips.discover = discoverMessage;

  const {
    should: shouldProspect,
    message: prospectMessage
  } = clearbit.shouldProspect({
    segments,
    user,
    account: acc
  });
  if (shouldProspect) return clearbit.prospectUsers(user, acc);
  skips.prospect = prospectMessage;

  const reason = { reason: "no action matched", ...skips };
  client.asUser(user).logger.info("outgoing.user.skip", reason);
  if (handle_accounts) {
    client.asAccount(account).logger.info("outgoing.account.skip", reason);
  }

  return false;
}
