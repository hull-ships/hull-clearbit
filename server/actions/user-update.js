import Clearbit from "../clearbit";
import userUpdateLogic from "./user-update-logic";

export default function handleUserUpdate({ hostSecret, stream = false }) {
  return ({
    client, ship, hostname, smartNotifierResponse, metric
  }, messages) => {
    if (smartNotifierResponse) {
      smartNotifierResponse.setFlowControl({
        type: "next", size: 100, in: 100
      });
    }

    const clearbit = new Clearbit({
      hull: client, ship, hostSecret, stream, metric, hostname
    });

    return Promise.all(messages.map(message => userUpdateLogic({ message, clearbit, client })));
  };
}
