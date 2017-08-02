import _ from "lodash";
import Promise from "bluebird";

import Clearbit from "../clearbit";

export default function handleProspect({ hostSecret }) {
  return (req, res) => {
    const { domains, role, seniority, titles, limit } = req.body;
    const { client: hull, ship } = req.hull;

    if (domains) {
      const cb = new Clearbit({ hull, ship, hostSecret });
      const prospecting = domains.map(domain => {
        let prospects = [];
        return Promise.mapSeries(titles, (title) => {
          const newLimit = limit - prospects.length;
          if (newLimit <= 0) {
            return Promise.resolve(prospects);
          }
          return cb.fetchProspects({ domain, role, seniority, title, limit: newLimit })
            .then((foundProspects) => {
              prospects = prospects.concat(foundProspects);
            });
        })
        .then(() => {
          return prospects;
        });
      });

      Promise.all(prospecting).then(prospects => {
        prospects = _.flatten(prospects);
        res.json({ prospects });
      }).catch((error) => {
        console.warn("Error prospecting...", error);
        res.json({ error });
      });
    } else {
      res.json({ message: "Empty list of domains..." });
    }
  };
}
