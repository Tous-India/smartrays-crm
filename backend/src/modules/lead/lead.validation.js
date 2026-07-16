import ApiError from "../../utils/ApiError.js";
import { LEAD_STATUSES, BUSINESS_STAGES } from "./lead.model.js";
import { CALL_OUTCOMES } from "./leadCall.model.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validates the body of POST /leads before the controller runs.
 */
export function validateCreateLeadInput(req, res, next) {
  const { name, email, status, businessStage, budget, lostReason } = req.body;

  if (!name || !name.trim()) {
    throw new ApiError(400, "Name is required");
  }

  if (email && !EMAIL_PATTERN.test(email)) {
    throw new ApiError(400, "Email must be a valid email address");
  }

  if (status && !LEAD_STATUSES.includes(status)) {
    throw new ApiError(400, `Status must be one of: ${LEAD_STATUSES.join(", ")}`);
  }

  if (status === "lost" && !lostReason) {
    throw new ApiError(400, "Lost reason is required when status is lost");
  }

  if (businessStage && !BUSINESS_STAGES.includes(businessStage)) {
    throw new ApiError(400, `Business stage must be one of: ${BUSINESS_STAGES.join(", ")}`);
  }

  if (budget !== undefined && budget !== null && Number(budget) < 0) {
    throw new ApiError(400, "Budget cannot be negative");
  }

  next();
}

/**
 * Validates the body of PATCH /leads/:id before the controller runs.
 * All fields are optional here since this is a partial update.
 */
export function validateUpdateLeadInput(req, res, next) {
  const { name, email, status, businessStage, budget, lostReason } = req.body;

  if (name !== undefined && !name.trim()) {
    throw new ApiError(400, "Name cannot be empty");
  }

  if (email && !EMAIL_PATTERN.test(email)) {
    throw new ApiError(400, "Email must be a valid email address");
  }

  if (status && !LEAD_STATUSES.includes(status)) {
    throw new ApiError(400, `Status must be one of: ${LEAD_STATUSES.join(", ")}`);
  }

  if (status === "lost" && !lostReason) {
    throw new ApiError(400, "Lost reason is required when status is lost");
  }

  if (businessStage && !BUSINESS_STAGES.includes(businessStage)) {
    throw new ApiError(400, `Business stage must be one of: ${BUSINESS_STAGES.join(", ")}`);
  }

  if (budget !== undefined && budget !== null && Number(budget) < 0) {
    throw new ApiError(400, "Budget cannot be negative");
  }

  next();
}

/**
 * Validates the body of PATCH /leads/:id/status.
 */
export function validateStatusChangeInput(req, res, next) {
  const { status, lostReason } = req.body;

  if (!status || !LEAD_STATUSES.includes(status)) {
    throw new ApiError(400, `Status must be one of: ${LEAD_STATUSES.join(", ")}`);
  }

  if (status === "lost" && !lostReason) {
    throw new ApiError(400, "Lost reason is required when marking a lead as lost");
  }

  next();
}

/**
 * Validates the body of POST /leads/:id/convert. companyName always has a
 * fallback (the lead's own companyName or name), but there's no lead-derived
 * fallback for projectManagerId — Lead has no equivalent field, and
 * Customer.projectManagerId is required (§6.3), so this is the one field the
 * caller must always supply.
 */
export function validateConvertLeadInput(req, res, next) {
  const { projectManagerId } = req.body;

  if (!projectManagerId) {
    throw new ApiError(400, "projectManagerId is required to convert a lead to a customer");
  }

  next();
}

/**
 * Validates the body of POST /leads/:id/calls.
 */
export function validateLogCallInput(req, res, next) {
  const { calledAt, outcome } = req.body;

  if (!calledAt || Number.isNaN(Date.parse(calledAt))) {
    throw new ApiError(400, "A valid calledAt date is required");
  }

  if (!outcome || !CALL_OUTCOMES.includes(outcome)) {
    throw new ApiError(400, `Outcome must be one of: ${CALL_OUTCOMES.join(", ")}`);
  }

  next();
}
