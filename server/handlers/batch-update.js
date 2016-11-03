import _ from "lodash";
import Bottleneck from "bottleneck";
import userUpdateHandler from "./user-update";

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

export default function handleBatchUpdate({ hostSecret }) {
  const handleUserUpdate = userUpdateHandler({
    hostSecret, stream: false, forceFetch: true
  });
  return (messages = [], context = {}) => {
    const { hull, ship, processed } = context;
    const limiter = Limiter.key(ship.id);
    hull.logger.info("processing batch", { processed });
    const handleMessage = (m, done) => {
      handleUserUpdate(m, context);
      done(m);
    };
    return messages.map(
      m => limiter.submit(handleMessage, m, () => {
        // DO NOT REMOVE THIS CALLBACK
        printLimits();
      })
    );
  };
}
