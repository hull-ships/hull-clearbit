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

      const cb = new Clearbit({ hull, ship, hostSecret, hostname, onMetric });

      // Return early if propector is not enabled
      if (!cb.propectorEnabled()) {
        res.json({ message: "thanks" });
        return cb.saveUser({ id: userId }, person);
      } 

      // TODO batch those calls
      Promise.all([
        hull.get(`${userId}/user_report`),
        hull.get(`${userId}/segments`),
        cb.saveUser({ id: userId }, person)
      ])
      .then(([user, segments]) => {
        if (cb.shouldProspect({ user, segments })) {
          const filters = cb.getFilterProspectOptions();
          cb.findSimilarPersons(person, filters);
        }
        res.json({ message: "thanks" });
      })
      .catch(error => {
        res.status(error.status || 500).json({
          stats: error.status,
          error: error.message
        });
      });
    } else {
      res.json({ message: "ignored" });
    }


    try {
      if (_.isFunction(onMetric)) {
        onMetric('webhook', 1, { id: ship.id });
      }      
    } catch (err) {
      console.warn('Error on webhook onMetric: ', err);
    }

  };
}
