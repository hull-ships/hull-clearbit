import _ from "lodash";

export default function userUpdateLogic({ message = {}, clearbit, client }) {
  const { user } = message;
  const skips = {};

  const {
    should: shouldEnrich,
    message: enrichMessage
  } = clearbit.shouldEnrich(message);
  if (shouldEnrich) {
    clearbit.enrich(message);
  } else {
    skips.enrich = enrichMessage;
  }

  const {
    should: shouldReveal,
    message: revealMessage
  } = clearbit.shouldReveal(message);
  if (shouldReveal) {
    clearbit.reveal(message);
  } else {
    skips.reveal = revealMessage;
  }

  if (_.size(skips)) {
    const reason = { reason: "no action matched", ...skips };
    client.asUser(user).logger.info("outgoing.user.skip", reason);
    return false;
  }

  return true;
}
