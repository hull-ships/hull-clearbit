import _ from "lodash";
import Bottleneck from "bottleneck";
import Clearbit from "../clearbit";

const Limiter = new Bottleneck.Cluster(3, 250);

const printLimits = _.throttle(() => {
  Limiter.all((limiter) => {
    const nbRunning = limiter.nbRunning();
    const nbQueued = limiter.nbQueued();
    if (nbRunning || nbQueued) {
      console.warn("Limiter", JSON.stringify({
        nbRunning,
        nbQueued
      }));
    }
  });
}, 1000);

setInterval(printLimits, 5000);

export default function handleBatchUpdate({ hostSecret, onMetric }) {
  return ({ client, ship, hostname }, messages = []) => {
    const limiter = Limiter.key(ship.id);

    const users = messages.map(m => m.user).filter(u => u.email);

    if (users.length === 0) {
      return false;
    }

    const clearbit = new Clearbit({
      hull: client, ship, hostSecret, stream: false, onMetric, hostname
    });

    const handleMessage = (user, done) => {
      if (clearbit.canReveal(user)) {
        clearbit.revealUser(user);
      } else if (clearbit.canEnrich(user)) {
        clearbit.enrichUser(user);
      }
      done(user);
    };

    return users.map(user => limiter.submit(handleMessage, user, () => {
      // DO NOT REMOVE THIS CALLBACK
      printLimits();
    }));
  };
}
