import ApiError from "../../utils/ApiError.js";

/**
 * Validates the body of POST /location/pings before the controller runs.
 */
export function validatePingInput(req, res, next) {
  const { coords, capturedAt } = req.body;

  if (!coords || typeof coords.lat !== "number" || typeof coords.lng !== "number") {
    throw new ApiError(400, "coords.lat and coords.lng are required numbers");
  }

  if (coords.lat < -90 || coords.lat > 90) {
    throw new ApiError(400, "coords.lat must be between -90 and 90");
  }

  if (coords.lng < -180 || coords.lng > 180) {
    throw new ApiError(400, "coords.lng must be between -180 and 180");
  }

  if (!capturedAt || Number.isNaN(Date.parse(capturedAt))) {
    throw new ApiError(400, "A valid capturedAt timestamp is required");
  }

  next();
}

/**
 * Validates the query string of GET /location/history before the controller runs.
 * Both employeeId and date are optional (default to self / today in the service).
 */
export function validateHistoryQuery(req, res, next) {
  const { date } = req.query;

  if (date && Number.isNaN(Date.parse(date))) {
    throw new ApiError(400, "date must be a valid date string");
  }

  next();
}
