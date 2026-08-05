import ApiError from "../../utils/ApiError.js";
import { ATTENDANCE_STATUSES, MARKABLE_STATUSES } from "./attendance.model.js";

const MONTH_PATTERN = /^\d{4}-\d{2}$/;
const DATE_PATTERN_SOURCE = "a valid date string";

/**
 * A multipart/form-data body (used when a photo file is attached) can only
 * carry flat string fields — `coords` arrives JSON-stringified rather than
 * as a real object the way it does in a plain JSON body. This normalizes
 * either transport into a real object and writes it back onto req.body so
 * the controller/service never need to know which transport was used.
 */
function extractCoords(req) {
  const raw = req.body.coords;

  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  return raw;
}

function validateCoords(coords) {
  if (!coords || typeof coords.lat !== "number" || typeof coords.lng !== "number") {
    throw new ApiError(400, "coords.lat and coords.lng are required numbers");
  }

  if (coords.lat < -90 || coords.lat > 90) {
    throw new ApiError(400, "coords.lat must be between -90 and 90");
  }

  if (coords.lng < -180 || coords.lng > 180) {
    throw new ApiError(400, "coords.lng must be between -180 and 180");
  }
}

/**
 * A photo is mandatory, not a client-side-only nicety — smartrays.md's whole
 * reason for capturing one is to prove physical presence at check-in/
 * check-out, and that protection doesn't exist at all if the API will
 * happily accept a request with no photo (anyone hitting the endpoint
 * directly, or a modified client, could bypass it entirely). Runs after
 * `upload.single("photo")` (attendance.routes.js), so by the time this
 * middleware executes, a multipart photo is already on `req.file` and a
 * base64 JSON one is already on `req.body.photo` — either is accepted.
 */
function validatePhotoPresence(req) {
  if (!req.file && !req.body.photo) {
    throw new ApiError(400, "A photo is required to prove physical presence at check-in/check-out.");
  }
}

export function validateCheckInInput(req, res, next) {
  const coords = extractCoords(req);
  validateCoords(coords);
  validatePhotoPresence(req);
  req.body.coords = coords;
  next();
}

export function validateCheckOutInput(req, res, next) {
  const coords = extractCoords(req);
  validateCoords(coords);
  validatePhotoPresence(req);
  req.body.coords = coords;
  next();
}

/**
 * Break In/Out (§7.4c, 2026-07-31) — coords are required, matching check-in's
 * own geolocation requirement, but deliberately does NOT call
 * `validatePhotoPresence` — no photo is required for either break event
 * (confirmed decision). Both routes are plain JSON-only (no `upload.single`
 * in attendance.routes.js), so `extractCoords`'s multipart-string-vs-real-
 * object normalization is technically moot here, but reused anyway for one
 * consistent coords-validation path across every attendance endpoint.
 */
export function validateBreakInInput(req, res, next) {
  const coords = extractCoords(req);
  validateCoords(coords);
  req.body.coords = coords;
  next();
}

export function validateBreakOutInput(req, res, next) {
  const coords = extractCoords(req);
  validateCoords(coords);
  req.body.coords = coords;
  next();
}

/**
 * Validates the optional ?month= query param on GET /attendance/me and
 * GET /attendance/team.
 */
export function validateMonthQuery(req, res, next) {
  const { month } = req.query;

  if (month && !MONTH_PATTERN.test(month)) {
    throw new ApiError(400, "month must be in YYYY-MM format");
  }

  next();
}

function validateOptionalTimeField(value, fieldLabel) {
  if (value === undefined || value === null) {
    return;
  }

  if (Number.isNaN(Date.parse(value))) {
    throw new ApiError(400, `${fieldLabel} must be ${DATE_PATTERN_SOURCE}`);
  }
}

/**
 * Validates PATCH /attendance/:id's body — `status`/`checkIn.time`/
 * `checkOut.time`, all optional (an admin might only be correcting one of
 * them), but each checked for validity when actually present.
 */
export function validateAdjustAttendanceInput(req, res, next) {
  const { status, checkIn, checkOut } = req.body;

  if (status !== undefined && !ATTENDANCE_STATUSES.includes(status)) {
    throw new ApiError(400, `status must be one of: ${ATTENDANCE_STATUSES.join(", ")}`);
  }

  validateOptionalTimeField(checkIn?.time, "checkIn.time");
  validateOptionalTimeField(checkOut?.time, "checkOut.time");

  next();
}

/**
 * Validates POST /attendance/manual's body — `employeeId`/`date` are
 * required (there's no record to attach `status`/`checkIn`/`checkOut` to
 * without them); everything else is optional, matching this endpoint's own
 * "no photo/geolocation required, admin override" nature.
 */
export function validateCreateManualAttendanceInput(req, res, next) {
  const { employeeId, date, status, checkIn, checkOut } = req.body;

  if (!employeeId) {
    throw new ApiError(400, "employeeId is required");
  }

  if (!date || Number.isNaN(Date.parse(date))) {
    throw new ApiError(400, `date is required and must be ${DATE_PATTERN_SOURCE}`);
  }

  if (status !== undefined && !ATTENDANCE_STATUSES.includes(status)) {
    throw new ApiError(400, `status must be one of: ${ATTENDANCE_STATUSES.join(", ")}`);
  }

  validateOptionalTimeField(checkIn?.time, "checkIn.time");
  validateOptionalTimeField(checkOut?.time, "checkOut.time");

  next();
}

/**
 * Validates POST /attendance/mark-status's body (2026-08-05). Narrower than
 * `validateCreateManualAttendanceInput` above by design: `status` is
 * REQUIRED and restricted to `MARKABLE_STATUSES` (absent/half_day only), and
 * `checkIn`/`checkOut` are not accepted at all — this endpoint fills a gap
 * on a day with no record, it never asserts a presence that would need
 * times to back it up.
 */
export function validateMarkAttendanceStatusInput(req, res, next) {
  const { employeeId, date, status } = req.body;

  if (!employeeId) {
    throw new ApiError(400, "employeeId is required");
  }

  if (!date || Number.isNaN(Date.parse(date))) {
    throw new ApiError(400, `date is required and must be ${DATE_PATTERN_SOURCE}`);
  }

  if (!MARKABLE_STATUSES.includes(status)) {
    throw new ApiError(400, `status must be one of: ${MARKABLE_STATUSES.join(", ")}`);
  }

  next();
}

/**
 * Validates GET /attendance/report's ?from=&to=&format= query params. All
 * are optional except format defaults to "xlsx" when omitted (done in the
 * route, not here, so downstream code always sees an explicit value).
 */
export function validateReportQuery(req, res, next) {
  const { from, to, format } = req.query;

  if (from && Number.isNaN(Date.parse(from))) {
    throw new ApiError(400, `from must be ${DATE_PATTERN_SOURCE}`);
  }

  if (to && Number.isNaN(Date.parse(to))) {
    throw new ApiError(400, `to must be ${DATE_PATTERN_SOURCE}`);
  }

  if (from && to && new Date(from) > new Date(to)) {
    throw new ApiError(400, "from must be before or equal to to");
  }

  if (format && !["pdf", "xlsx"].includes(format)) {
    throw new ApiError(400, "format must be either 'pdf' or 'xlsx'");
  }

  next();
}
