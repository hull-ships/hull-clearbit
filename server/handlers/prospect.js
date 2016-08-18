import Clearbit from "../clearbit";

export default function handleProspect({ hostSecret }) {
  return (req, res) => {
    const { domains, role, seniority, titles } = req.body;
    const { client: hull, ship } = req.hull;

    if (domains) {
      const cb = new Clearbit({ hull, ship, hostSecret });
      const prospecting = domains.map(domain => {
        return cb.fetchProspectsFromCompany({ domain }, { role, seniority, titles });
      });
      Promise.all(prospecting).then(
        (prospects) => res.json({ prospects }),
      ).catch((error) => {
        console.warn("Error prospecting...", error);
        res.json({ error });
      });
    } else {
      res.json({ message: "Empty list of domains..." });
    }
  };
}
