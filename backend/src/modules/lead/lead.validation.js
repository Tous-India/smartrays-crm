import ApiError from "../../utils/ApiError.js";
import {
  LEAD_STATUSES,
  BUSINESS_STAGES,
  CLIENT_TYPES,
  ROOF_TYPES,
  CONNECTION_TYPES,
  SITE_SURVEY_STATUSES,
} from "./lead.model.js";
import { CALL_OUTCOMES } from "./leadCall.model.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Shared solar-field checks for both create and update — every field here is
 * optional on its own (only `clientType` is unconditionally required, and
 * only on create, enforced separately by each caller below), but any of them
 * that IS present must be a valid value/range.
 */
function validateSolarFields(body) {
  const {
    clientType,
    monthlyElectricityBill,
    estimatedUnitsConsumed,
    estimatedCapacityKw,
    roofType,
    connectionType,
    siteSurveyStatus,
    siteSurveyDate,
  } = body;

  if (clientType !== undefined && !CLIENT_TYPES.includes(clientType)) {
    throw new ApiError(400, `clientType must be one of: ${CLIENT_TYPES.join(", ")}`);
  }

  if (monthlyElectricityBill !== undefined && monthlyElectricityBill !== null && Number(monthlyElectricityBill) < 0) {
    throw new ApiError(400, "monthlyElectricityBill cannot be negative");
  }

  if (estimatedUnitsConsumed !== undefined && estimatedUnitsConsumed !== null && Number(estimatedUnitsConsumed) < 0) {
    throw new ApiError(400, "estimatedUnitsConsumed cannot be negative");
  }

  if (estimatedCapacityKw !== undefined && estimatedCapacityKw !== null && Number(estimatedCapacityKw) < 0) {
    throw new ApiError(400, "estimatedCapacityKw cannot be negative");
  }

  if (roofType && !ROOF_TYPES.includes(roofType)) {
    throw new ApiError(400, `roofType must be one of: ${ROOF_TYPES.join(", ")}`);
  }

  if (connectionType && !CONNECTION_TYPES.includes(connectionType)) {
    throw new ApiError(400, `connectionType must be one of: ${CONNECTION_TYPES.join(", ")}`);
  }

  if (siteSurveyStatus && !SITE_SURVEY_STATUSES.includes(siteSurveyStatus)) {
    throw new ApiError(400, `siteSurveyStatus must be one of: ${SITE_SURVEY_STATUSES.join(", ")}`);
  }

  if (siteSurveyDate && Number.isNaN(Date.parse(siteSurveyDate))) {
    throw new ApiError(400, "siteSurveyDate must be a valid date");
  }
}

/**
 * Validates the body of POST /leads before the controller runs.
 */
export function validateCreateLeadInput(req, res, next) {
  const { name, email, status, businessStage, budget, lostReason, clientType } = req.body;

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

  if (!clientType) {
    throw new ApiError(400, "clientType is required");
  }

  validateSolarFields(req.body);

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

  if (req.body.clientType !== undefined && !req.body.clientType) {
    throw new ApiError(400, "clientType cannot be cleared — it is required");
  }

  validateSolarFields(req.body);

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
