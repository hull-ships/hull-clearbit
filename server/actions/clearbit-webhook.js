import _ from "lodash";
import Clearbit from "../clearbit";

export default function handleWebhook({ hostSecret, onMetric }) {
  return (req, res) => {
    const { status, type, body } = req.body;
    const { client: hull, ship } = req.hull;
    const { hostname } = req;
    const userId = req.hull.config.userId;

    if ((type === "person" || type === "person_company") && status === 200 && userId) {
      let person;

      if (type === "person") {
        person = body;
      } else if (type === "person_company") {
        person = { ...body.person, company: body.company };
      }

      if (person) {
        hull.asUser({ id: userId }).logger.info("incoming.user.start", { source: "webhook" });
        const cb = new Clearbit({ hull, ship, hostSecret, hostname, onMetric });
        cb.saveUser({ id: userId }, person, "enrich");
      }

      res.json({ message: "thanks" });
    } else {
      res.json({ message: "ignored" });
    }

    try {
      if (_.isFunction(onMetric)) {
        onMetric("webhook", 1, { id: ship ? ship.id : null });
      }
    } catch (err) {
      console.warn("Error on webhook onMetric: ", err);
    }
  };
}
