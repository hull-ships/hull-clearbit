import _ from "lodash";
import Promise from "bluebird";
import { smartNotifierHandler } from "hull/lib/utils";
import Clearbit from "../clearbit";
import userUpdateLogic from "../lib/user-update-logic";
import accountUpdateLogic from "../lib/account-update-logic";

const flowControl = {
  type: "next",
  size: parseInt(process.env.FLOW_CONTROL_SIZE, 10) || 200,
  in: parseInt(process.env.FLOW_CONTROL_IN, 10) || 100
};

export default function notifyHandler({ hostSecret, stream = false }) {
  return smartNotifierHandler({
    handlers: {
      "account:update": (
        { client, ship, hostname, smartNotifierResponse, metric },
        messages = []
      ) => {
        smartNotifierResponse.setFlowControl(flowControl);
        const clearbit = new Clearbit({
          hull: client,
          connector: ship,
          hostSecret,
          stream,
          metric,
          hostname
        });
        const ids = _.reduce(
          messages,
          (memo, { account = {} }) => {
            if (account.id) memo.push(account.id);
            return memo;
          },
          []
        );

        client.logger.info("outgoing.account.start", { ids });

        if (!ids.length) {
          return client.logger.info("outgoing.account.skip", {
            ids
          });
        }

        return Promise.all(
          messages.map(message =>
            accountUpdateLogic({ message, clearbit, client })
          )
        ).then(res => {
          return res;
        });
      },

      "user:update": (
        { client, ship, hostname, smartNotifierResponse, metric },
        messages = []
      ) => {
        smartNotifierResponse.setFlowControl(flowControl);
        const clearbit = new Clearbit({
          hull: client,
          connector: ship,
          hostSecret,
          stream,
          metric,
          hostname
        });

        const ids = _.reduce(
          messages,
          (memo, { user = {}, account = {} }) => {
            if (user.id) memo.users.push(user.id);
            if (account.id) memo.accounts.push(account.id);
            return memo;
          },
          {
            users: [],
            accounts: []
          }
        );
        if (ids.accounts.length) {
          client.logger.info("outgoing.account.start", { ids: ids.accounts });
        }
        client.logger.info("outgoing.user.start", { ids: ids.users });

        return Promise.all(
          messages.map(message =>
            userUpdateLogic({ message, clearbit, client })
          )
        ).then(res => {
          return res;
        });
      }
    }
  });
}
