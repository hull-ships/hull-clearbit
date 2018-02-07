import { notifHandler } from "hull/lib/utils";
import _ from "lodash";
import Bottleneck from "bottleneck";
import Clearbit from "../clearbit";

const Limiter = new Bottleneck.Group({
  maxConcurrent: 3,
  minTime: 250
});

const printLimits = _.throttle(() => {
  Limiter.limiters().map(({ limiter }) => {
    const nbRunning = limiter.running();
    const nbQueued = limiter.queued();
    if (nbRunning || nbQueued) {
      console.warn(
        "Limiter",
        JSON.stringify({
          nbRunning,
          nbQueued
        })
      );
    }
    return true;
  });
}, 1000);

setInterval(printLimits, 5000);

function handleBatchUpdate({ hostSecret }) {
  return ({ metric, client, ship, hostname }, messages = []) => {
    const limiter = Limiter.key(ship.id);

    const users = messages.map(m => m.user).filter(u => u.email);

    if (users.length === 0) {
      return false;
    }

    const clearbit = new Clearbit({
      hull: client,
      ship,
      hostSecret,
      stream: false,
      metric: metric.increment,
      hostname
    });

    const handleMessage = (user, done) => {
      if (clearbit.canReveal(user)) {
        clearbit.revealUser(user);
      } else if (clearbit.canEnrich(user)) {
        clearbit.enrichUser(user);
      }
      done(user);
    };

    return users.map(user =>
      limiter.submit(handleMessage, user, () => {
        // DO NOT REMOVE THIS CALLBACK
        printLimits();
      })
    );
  };
}

export default function batchHandlerFactory(options) {
  return notifHandler({
    hostSecret: options.hostSecret,
    userHandlerOptions: {
      groupTraits: false,
      maxSize: 100,
      maxTime: 120
    },
    handlers: {
      "user:update": handleBatchUpdate(options)
    }
  });
}
