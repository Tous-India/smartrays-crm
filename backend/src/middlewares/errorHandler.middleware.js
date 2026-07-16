import ApiError from "../utils/ApiError.js";
import { env } from "../config/env.js";

/**
 * Global error handler. Must be registered last, after all routes.
 * Converts any thrown error (ApiError or otherwise) into the standard
 * { success, message, errors } response shape.
 */
// eslint-disable-next-line no-unused-vars
function errorHandlerMiddleware(error, req, res, next) {
  let apiError = error;

  if (!(apiError instanceof ApiError)) {
    const statusCode = apiError.statusCode || 500;
    const message = apiError.message || "Internal server error";
    apiError = new ApiError(statusCode, message, apiError.errors || []);
  }

  const responseBody = {
    success: false,
    message: apiError.message,
    errors: apiError.errors,
  };

  if (!env.isProduction) {
    responseBody.stack = apiError.stack;
  }

  console.error(`[Error] ${req.method} ${req.originalUrl} -`, apiError.message);

  res.status(apiError.statusCode).json(responseBody);
}

export default errorHandlerMiddleware;
