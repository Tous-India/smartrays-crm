/**
 * Standard error shape thrown anywhere in the app (services, validation, middlewares).
 * The global error handler middleware catches these and formats a consistent response.
 */
class ApiError extends Error {
  constructor(statusCode, message = "Something went wrong", errors = []) {
    super(message);

    this.statusCode = statusCode;
    this.errors = errors;
    this.success = false;

    Error.captureStackTrace(this, this.constructor);
  }
}

export default ApiError;
