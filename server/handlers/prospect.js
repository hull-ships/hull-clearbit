import _ from "lodash";
import Promise from "bluebird";

import Clearbit from "../clearbit";

export default function handleProspect({ hostSecret }) {
  return (req, res) => {
    const { domains, role, seniority, titles = [], limit } = req.body;
    const { client: hull, ship } = req.hull;
    let newLimit = limit;
    if (domains) {
      const cb = new Clearbit({ hull, ship, hostSecret });
      const prospecting = Promise.mapSeries(domains, (domain) => {
        const params = { domain, role, seniority, titles, limit: newLimit };
        return cb.fetchProspects(params).then((ret) => {
          newLimit -= ret.length;
          return ret;
        });
      });

      Promise.all(prospecting).then((results) => {
        res.json({ prospects: _.flatten(results) });
      }).catch((error) => {
        console.warn("Error prospecting...", error);
        res.json({ error });
      });
    } else {
      res.json({ message: "Empty list of domains..." });
    }
  };
}
