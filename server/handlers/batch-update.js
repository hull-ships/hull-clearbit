import userUpdateHandler from "./user-update";

export default function handleBatchUpdate({ hostSecret }) {
  const handleUserUpdate = userUpdateHandler({
    hostSecret, stream: true, forceFetch: true
  });

  return (messages = [], { hull, ship }) => {
    return messages.map(
      m => handleUserUpdate(m, { hull, ship })
    );
  };
}
