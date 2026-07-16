/**
 * Wraps an async route handler so any rejected promise is forwarded to
 * Express's error handling middleware instead of crashing the process.
 */
const asyncWrapper = (requestHandler) => {
  return (req, res, next) => {
    Promise.resolve(requestHandler(req, res, next)).catch((error) => next(error));
  };
};

export default asyncWrapper;
