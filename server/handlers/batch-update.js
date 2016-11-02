import userUpdateHandler from "./user-update";

export default function handleBatchUpdate({ hostSecret }) {
  const handleUserUpdate = userUpdateHandler({
    hostSecret, stream: true, forceFetch: true
  });
  return (messages = [], context = {}) => {
    const { hull, processed } = context;
    hull.logger.info("processing batch", { processed });
    return messages.map(
      m => handleUserUpdate(m, context)
    );
  };
}
