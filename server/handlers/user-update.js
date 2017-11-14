import Clearbit from "../clearbit";
import userUpdateLogic from "./user-update-logic";

export default function handleUserUpdate({ hostSecret, stream = false, onMetric }) {
  return ({ client, ship, hostname }, messages) => {
    const clearbit = new Clearbit({
      hull: client, ship, hostSecret, stream, onMetric, hostname
    });

    messages.forEach(message => userUpdateLogic({ message, clearbit, client }));
  };
}
