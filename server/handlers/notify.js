import Promise from "bluebird";
import { smartNotifierHandler } from "hull/lib/utils";
import Clearbit from "../clearbit";
import userUpdateLogic from "../lib/user-update-logic";

export default function notifyHandler({ hostSecret, stream = false }) {
  return smartNotifierHandler({
    handlers: {
      "user:update": (
        { client, ship, hostname, smartNotifierResponse, metric },
        messages = []
      ) => {
        smartNotifierResponse.setFlowControl({
          type: "next",
          size: 100,
          in: 100
        });
        const clearbit = new Clearbit({
          hull: client,
          ship,
          hostSecret,
          stream,
          metric,
          hostname
        });
        return Promise.all(
          messages.map(message =>
            userUpdateLogic({ message, clearbit, client })
          )
        );
      }
    }
  });
}
