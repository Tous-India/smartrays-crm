import ApiError from "../../utils/ApiError.js";
import { LEAVE_TYPES } from "./leave.model.js";

// unapproved_absence is deliberately excluded here — it's only ever set via
// the dedicated PATCH /leave/:id/mark-unapproved-absence admin action, never
// requestable directly.
const REQUESTABLE_LEAVE_TYPES = LEAVE_TYPES.filter((type) => type !== "unapproved_absence");

// Timezone-independent day comparison — comparing via `.toDateString()` or
// local getFullYear/Month/Date would shift near a day boundary depending on
// the server/test-runner's local timezone (a recurring bug class in this
// codebase, e.g. Attendance/Reports' own UTC-formatting fixes); comparing the
// UTC calendar-date key instead is consistent regardless of what time
// component (if any) startDate/endDate carry.
function utcDateKey(date) {
  return new Date(date).toISOString().slice(0, 10);
}

export function validateLeaveRequestInput(req, res, next) {
  const { startDate, endDate, type, isHalfDay } = req.body;

  if (!startDate || Number.isNaN(Date.parse(startDate))) {
    throw new ApiError(400, "A valid startDate is required");
  }

  if (!endDate || Number.isNaN(Date.parse(endDate))) {
    throw new ApiError(400, "A valid endDate is required");
  }

  if (new Date(startDate) > new Date(endDate)) {
    throw new ApiError(400, "startDate must be before or equal to endDate");
  }

  if (type && !REQUESTABLE_LEAVE_TYPES.includes(type)) {
    throw new ApiError(400, `type must be one of: ${REQUESTABLE_LEAVE_TYPES.join(", ")}`);
  }

  if (isHalfDay !== undefined && typeof isHalfDay !== "boolean") {
    throw new ApiError(400, "isHalfDay must be a boolean");
  }

  if (isHalfDay && utcDateKey(startDate) !== utcDateKey(endDate)) {
    throw new ApiError(400, "A half-day leave request must have the same startDate and endDate");
  }

  next();
}

export function validateScopeQuery(req, res, next) {
  const { scope } = req.query;

  if (scope && !["own", "team", "all"].includes(scope)) {
    throw new ApiError(400, "scope must be one of: own, team, all");
  }

  next();
}

export function validateDeclineInput(req, res, next) {
  const { reason } = req.body;

  if (reason !== undefined && typeof reason !== "string") {
    throw new ApiError(400, "reason must be a string");
  }

  next();
}
