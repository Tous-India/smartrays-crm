import ApiError from "../../utils/ApiError.js";
import { LEAVE_TYPES } from "./leave.model.js";

// unapproved_absence is deliberately excluded here — it's only ever set via
// the dedicated PATCH /leave/:id/mark-unapproved-absence admin action, never
// requestable directly.
const REQUESTABLE_LEAVE_TYPES = LEAVE_TYPES.filter((type) => type !== "unapproved_absence");

export function validateLeaveRequestInput(req, res, next) {
  const { startDate, endDate, type } = req.body;

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

  next();
}

export function validateScopeQuery(req, res, next) {
  const { scope } = req.query;

  if (scope && !["own", "team", "all"].includes(scope)) {
    throw new ApiError(400, "scope must be one of: own, team, all");
  }

  next();
}
