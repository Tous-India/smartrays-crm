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
/**
 * `date` (single day, original) OR `from`/`to` (range, §7.67). Both are
 * optional; the service defaults to the last 45 days and clamps anything wider.
 *
 * The 45-day maximum is NOT enforced here as a 400 — the service clamps it and
 * reports `cappedToMaxDays` instead. Rejecting would make a bookmarked "last
 * quarter" link fail rather than quietly return what actually exists.
 */
export function validateHistoryQuery(req, res, next) {
  const { date, from, to } = req.query;

  [
    ["date", date],
    ["from", from],
    ["to", to],
  ].forEach(([name, value]) => {
    if (value && Number.isNaN(Date.parse(value))) {
      throw new ApiError(400, `${name} must be a valid date string`);
    }
  });

  if (from && to && new Date(from) > new Date(to)) {
    throw new ApiError(400, "from must not be after to");
  }

  next();
}
