import userUpdateHandler from "./user-update";

export default function handleBatchUpdate({ hostSecret }) {
  const handleUserUpdate = userUpdateHandler({
    hostSecret, stream: true, forceFetch: true
  });
  return (messages = [], context) => {
  	console.warn("processing batch ", { processed: context.processed });
    return messages.map(
      m => handleUserUpdate(m, context)
    );
  };
}
