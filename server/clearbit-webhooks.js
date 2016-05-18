import jwt from 'jwt-simple';
import saveUser from './save-user';
import _ from 'lodash';
import Hull from 'hull';
import cache from './lib/hull-cache';

const shipToken = process.env.SHIP_TOKEN || '3095jv02939jfd';

export default function (req, res) {
  try {
    const { id: webhookId, status, type, body } = req.body;
    const { organization, id, secret, userId } = jwt.decode(webhookId, shipToken);

    if (type === 'person' && status === 200 && _.isObject(body)) {
      const hull = new Hull({ organization, id, secret });

      cache(hull, userId + "/user_report").then((user) => {
        saveUser({ hull, user: hull.utils.groupTraits(user), person: body });
        res.status(200);
        res.end('ok');
      }).catch((err) => {
        console.log(err);
        res.status(500);
        res.end('ok');
      });
    } else {
      res.status(400);
      res.end('Invalid Request');
    }
  } catch(err) {
    console.warn("error", err);
    res.status(500);
    res.end(err.message);
  }
}
