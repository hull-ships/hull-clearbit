export default function errorHandler(onError) {
  return function (req, res, next) {
    res.handleError = function (message, status) {
      let msg;
      if (typeof message !== 'string') {
        msg = message.toString();
        if (message.stack) {
          console.log(message.stack);
        }
      } else {
        msg = message;
      }
      if (onError) onError(msg, status);
      res.status(status);
      res.end(msg);
    };
    next();
  };
}
