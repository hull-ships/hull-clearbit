import _ from "lodash";
import Promise from "bluebird";
import { smartNotifierHandler } from "hull/lib/utils";
import Clearbit from "../clearbit";
import userUpdateLogic from "../lib/user-update-logic";

export default function notifyHandler({ hostSecret, stream = false }) {
  return smartNotifierHandler({
    handlers: {
      "user:update": (
        { client, ship, hostname, smartNotifierResponse, metric },
        messages = []
      ) => {
        smartNotifierResponse.setFlowControl({
          type: "next",
          size: parseInt(process.env.FLOW_CONTROL_SIZE, 10) || 200,
          in: parseInt(process.env.FLOW_CONTROL_IN, 10) || 100
        });
        const clearbit = new Clearbit({
          hull: client,
          ship,
          hostSecret,
          stream,
          metric,
          hostname
        });
        const { private_settings } = ship;
        const { handle_accounts } = private_settings;

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
        if (handle_accounts && ids.accounts.length) {
          client.logger.info("outgoing.account.start", { ids: ids.accounts });
        }
        client.logger.info("outgoing.user.start", { ids: ids.users });

        return Promise.all(
          messages.map(message =>
            userUpdateLogic({ message, handle_accounts, clearbit, client })
          )
        ).then(res => {
          return res;
        });
      }
    }
  });
}
