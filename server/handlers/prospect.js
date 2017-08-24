import _ from "lodash";
import Promise from "bluebird";

import Clearbit from "../clearbit";

export default function handleProspect({ hostSecret }) {
  return (req, res) => {
    const { domains, role, seniority, titles = [], limit } = req.body;
    const { client: hull, ship } = req.hull;

    if (domains) {
      const cb = new Clearbit({ hull, ship, hostSecret });
      const prospecting = Promise.mapSeries(domains, (domain) => {
        const params = { domain, role, seniority, titles, limit };
        return cb.fetchProspects(params).then((ret) => {
          return ret;
        });
      });

      Promise.all(prospecting).then((results) => {
        const resData = _.flatten(results);
        // We need to check in case the request timed out earlier.
        // It seems that one of the middleware components is setting headers and writing into the
        // body without ending the response.
        if (!res.headersSent) {
          res.status(200).json({ prospects: resData });
        } else {
          res.end();
        }
      }).catch((error) => {
        console.warn("Error prospecting...", error);
        res.status(500).json({ error });
      });
    } else {
      res.status(404).json({ message: "Empty list of domains..." });
    }
  };
}
