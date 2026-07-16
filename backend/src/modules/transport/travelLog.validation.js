import ApiError from "../../utils/ApiError.js";

const MONTH_PATTERN = /^\d{4}-\d{2}$/;

function validateCoords(coords, label) {
  if (typeof coords.lat !== "number" || typeof coords.lng !== "number") {
    throw new ApiError(400, `${label}.lat and ${label}.lng are required numbers`);
  }

  if (coords.lat < -90 || coords.lat > 90) {
    throw new ApiError(400, `${label}.lat must be between -90 and 90`);
  }

  if (coords.lng < -180 || coords.lng > 180) {
    throw new ApiError(400, `${label}.lng must be between -180 and 180`);
  }
}

/**
 * Validates the body of POST /travel-logs. Requires either `distanceKm` or
 * both `originCoords`/`destinationCoords` — there needs to be something to
 * either use directly or compute a distance from. Whichever coords ARE
 * present get validated regardless of whether `distanceKm` was also given.
 */
export function validateManualEntryInput(req, res, next) {
  const { originCoords, destinationCoords, distanceKm, date } = req.body;

  const hasDistance = distanceKm !== undefined && distanceKm !== null;
  const hasBothCoords = originCoords !== undefined && destinationCoords !== undefined;

  if (!hasDistance && !hasBothCoords) {
    throw new ApiError(400, "Provide either distanceKm or both originCoords and destinationCoords");
  }

  if (hasDistance && (typeof distanceKm !== "number" || distanceKm < 0)) {
    throw new ApiError(400, "distanceKm must be a non-negative number");
  }

  if (originCoords !== undefined) {
    validateCoords(originCoords, "originCoords");
  }

  if (destinationCoords !== undefined) {
    validateCoords(destinationCoords, "destinationCoords");
  }

  if (date && Number.isNaN(Date.parse(date))) {
    throw new ApiError(400, "date must be a valid date string");
  }

  next();
}

/**
 * Validates GET /travel-logs's ?scope=&month= query params.
 */
export function validateListQuery(req, res, next) {
  const { scope, month } = req.query;

  if (scope && !["own", "team", "all"].includes(scope)) {
    throw new ApiError(400, "scope must be one of: own, team, all");
  }

  if (month && !MONTH_PATTERN.test(month)) {
    throw new ApiError(400, "month must be in YYYY-MM format");
  }

  next();
}

/**
 * Validates GET /travel-logs/report's ?from=&to=&format= query params.
 */
export function validateReportQuery(req, res, next) {
  const { from, to, format } = req.query;

  if (from && Number.isNaN(Date.parse(from))) {
    throw new ApiError(400, "from must be a valid date string");
  }

  if (to && Number.isNaN(Date.parse(to))) {
    throw new ApiError(400, "to must be a valid date string");
  }

  if (from && to && new Date(from) > new Date(to)) {
    throw new ApiError(400, "from must be before or equal to to");
  }

  if (format && !["pdf", "xlsx"].includes(format)) {
    throw new ApiError(400, "format must be either 'pdf' or 'xlsx'");
  }

  next();
}
