import ApiError from "../../utils/ApiError.js";
import { AMC_STATUSES, AMC_CREATED_FROM_FLOWS } from "./amc.model.js";
import { validateCreateCustomerInput } from "../customer/customer.validation.js";

/**
 * Validates POST /amc's `{ flow, customerId?, newCustomerPayload?, amount?,
 * startDate, renewalDate }` body. For `flow: "new_customer"`, reuses
 * `customer.validation.js#validateCreateCustomerInput` directly against
 * `newCustomerPayload` rather than duplicating its required-field checks —
 * called as a plain function (not mounted as its own route middleware),
 * since it only reads `req.body` and throws or calls `next()`.
 */
export function validateCreateAMCInput(req, res, next) {
  const { flow, customerId, newCustomerPayload, amount, startDate, renewalDate } = req.body;

  if (!AMC_CREATED_FROM_FLOWS.includes(flow)) {
    throw new ApiError(400, `flow must be one of: ${AMC_CREATED_FROM_FLOWS.join(", ")}`);
  }

  if (flow === "existing_customer" && !customerId) {
    throw new ApiError(400, "customerId is required for the existing_customer flow");
  }

  if (flow === "new_customer") {
    if (!newCustomerPayload || typeof newCustomerPayload !== "object") {
      throw new ApiError(400, "newCustomerPayload is required for the new_customer flow");
    }

    validateCreateCustomerInput({ body: newCustomerPayload }, res, () => {});
  }

  if (!startDate || Number.isNaN(Date.parse(startDate))) {
    throw new ApiError(400, "A valid startDate is required");
  }

  if (!renewalDate || Number.isNaN(Date.parse(renewalDate))) {
    throw new ApiError(400, "A valid renewalDate is required");
  }

  if (amount !== undefined && amount !== null && Number(amount) < 0) {
    throw new ApiError(400, "amount cannot be negative");
  }

  next();
}

export function validateUpdateAMCInput(req, res, next) {
  const { amount, startDate, renewalDate, status } = req.body;

  if (amount !== undefined && amount !== null && Number(amount) < 0) {
    throw new ApiError(400, "amount cannot be negative");
  }

  if (startDate !== undefined && Number.isNaN(Date.parse(startDate))) {
    throw new ApiError(400, "startDate must be a valid date");
  }

  if (renewalDate !== undefined && Number.isNaN(Date.parse(renewalDate))) {
    throw new ApiError(400, "renewalDate must be a valid date");
  }

  if (status !== undefined && !AMC_STATUSES.includes(status)) {
    throw new ApiError(400, `status must be one of: ${AMC_STATUSES.join(", ")}`);
  }

  next();
}

/**
 * Validates POST /amc/:id/renew's body. Every field is OPTIONAL — the point
 * of the endpoint is that it derives sensible defaults from the record being
 * renewed (see `amc.service.js#renewAMC`); the body only exists to override
 * them. `status` is deliberately not accepted: a renewal is always active by
 * definition, and the old record is always expired.
 */
export function validateRenewAMCInput(req, res, next) {
  const { amount, startDate, renewalDate } = req.body || {};

  if (amount !== undefined && amount !== null && Number(amount) < 0) {
    throw new ApiError(400, "amount cannot be negative");
  }

  if (startDate !== undefined && Number.isNaN(Date.parse(startDate))) {
    throw new ApiError(400, "startDate must be a valid date");
  }

  if (renewalDate !== undefined && Number.isNaN(Date.parse(renewalDate))) {
    throw new ApiError(400, "renewalDate must be a valid date");
  }

  next();
}
