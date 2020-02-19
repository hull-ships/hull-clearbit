export default function userUpdateLogic({
  message = {},
  handle_accounts,
  clearbit,
  client
}) {
  const { segments, user, account } = message;
  const acc = account || user.account;

  const skips = {};

  if (clearbit.canEnrich(user)) {
    const { should, message: msg } = clearbit.shouldEnrich(message);
    if (should) return clearbit.enrichUser(user, acc);
    skips.enrich = msg;
  } else if (clearbit.canEnrichAcct(account)) {
    const { should, message: msg } = clearbit.shouldEnrichAcct(message);
    if (should) return clearbit.enrichAcct(account);
    skips.enrich = msg;
  }

  if (clearbit.canReveal(user)) {
    const { should, message: msg } = clearbit.shouldReveal(message);
    if (should) return clearbit.revealUser(user, acc);
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

  if (shouldProspect) {
    return clearbit.prospectUser(user, acc);
  }
  skips.prospect = prospectMessage;

  const reason = { reason: "no action matched", ...skips };
  client.asUser(user).logger.debug("outgoing.user.skip", reason);
  if (handle_accounts) {
    client.asAccount(account).logger.debug("outgoing.account.skip", reason);
  }

  return false;
}
