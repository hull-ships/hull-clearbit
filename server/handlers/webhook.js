import _ from "lodash";
import Clearbit from "../clearbit";

export default function handleWebhook({ hostSecret, Hull }) {
  return (req, res) => {
    Hull.logger.debug("clearbit.webhook.payload", {
      query: req.query,
      body: req.body
    });
    const { status, type, body } = req.body;
    const { client: hull, ship, metric } = req.hull;
    const { hostname } = req;
    const { userId } = req.hull.config;

    if (
      (type === "person" || type === "person_company") &&
      status === 200 &&
      userId
    ) {
      let person;

      if (type === "person") {
        person = body;
      } else if (type === "person_company") {
        person = { ...body.person, company: body.company };
      }

      if (person) {
        hull
          .asUser({ id: userId })
          .logger.info("incoming.user.start", { source: "webhook" });
        const cb = new Clearbit({
          hull,
          ship,
          hostSecret,
          hostname,
          metric
        });
        cb.saveUser(
          { user: { id: userId }, person },
          {
            source: "enrich",
            incoming: true
          }
        );
      }

      res.json({ message: "thanks" });
    } else {
      res.json({ message: "ignored" });
    }

    try {
      if (_.isFunction(metric)) {
        metric("ship.clearbit.incoming_webhook", 1);
      }
    } catch (err) {
      Hull.logger.debug(
        "Error when trying to increase ship.clearbit.incoming_webhook counter",
        err
      );
    }
  };
}
