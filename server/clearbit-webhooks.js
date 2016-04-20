import jwt from 'jwt-simple';
import saveUser from './save-user';
import _ from 'lodash';
import Hull from 'hull';
import cache from './lib/hull-cache';

const shipToken = process.env.SHIP_TOKEN || '3095jv02939jfd';

export default function (req, res) {
  const { id: webhookId, status, type, body } = req.body;
  const { organization, id, secret, userId } = jwt.decode(webhookId, shipToken);
  if (type === 'person' && status === 200 && _.isObject(body)) {
    const hull = new Hull({ organization, id, secret });

    cache(hull, userId).then((user) => {
      saveUser({ hull, user:Hull.utils.groupTraits(user), person: body });
      res.sendStatus(200);
    }).catch((err) => {
      console.log(err);
      res.sendStatus(500);
    });
  }
}
