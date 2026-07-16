import ApiError from "../../utils/ApiError.js";
import { BILLING_TYPES, CUSTOMER_STATUSES } from "./customer.model.js";
import { CONTRACT_TYPES } from "./contract.model.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateCreateCustomerInput(req, res, next) {
  const { companyName, projectManagerId, billingType, email, customerStatus } = req.body;

  if (!companyName || !companyName.trim()) {
    throw new ApiError(400, "companyName is required");
  }

  if (!projectManagerId) {
    throw new ApiError(400, "projectManagerId is required");
  }

  if (billingType && !BILLING_TYPES.includes(billingType)) {
    throw new ApiError(400, `billingType must be one of: ${BILLING_TYPES.join(", ")}`);
  }

  if (email && !EMAIL_PATTERN.test(email)) {
    throw new ApiError(400, "Email must be a valid email address");
  }

  if (customerStatus && !CUSTOMER_STATUSES.includes(customerStatus)) {
    throw new ApiError(400, `customerStatus must be one of: ${CUSTOMER_STATUSES.join(", ")}`);
  }

  next();
}

export function validateUpdateCustomerInput(req, res, next) {
  const { companyName, billingType, email, customerStatus } = req.body;

  if (companyName !== undefined && !companyName.trim()) {
    throw new ApiError(400, "companyName cannot be empty");
  }

  if (billingType && !BILLING_TYPES.includes(billingType)) {
    throw new ApiError(400, `billingType must be one of: ${BILLING_TYPES.join(", ")}`);
  }

  if (email && !EMAIL_PATTERN.test(email)) {
    throw new ApiError(400, "Email must be a valid email address");
  }

  if (customerStatus && !CUSTOMER_STATUSES.includes(customerStatus)) {
    throw new ApiError(400, `customerStatus must be one of: ${CUSTOMER_STATUSES.join(", ")}`);
  }

  next();
}

export function validateBulkActionInput(req, res, next) {
  const { ids, action } = req.body;

  if (!Array.isArray(ids) || ids.length === 0) {
    throw new ApiError(400, "ids must be a non-empty array");
  }

  if (!["activate", "deactivate", "delete"].includes(action)) {
    throw new ApiError(400, "action must be one of: activate, deactivate, delete");
  }

  next();
}

export function validateContactInput(req, res, next) {
  const { name, email } = req.body;

  if (!name || !name.trim()) {
    throw new ApiError(400, "name is required");
  }

  if (email && !EMAIL_PATTERN.test(email)) {
    throw new ApiError(400, "Email must be a valid email address");
  }

  next();
}

/**
 * PATCH /customers/:id/contacts/:contactId — name is optional here (a partial
 * update might only touch designation/phone), unlike creation where it's
 * mandatory.
 */
export function validateContactUpdateInput(req, res, next) {
  const { name, email } = req.body;

  if (name !== undefined && !name.trim()) {
    throw new ApiError(400, "name cannot be empty");
  }

  if (email && !EMAIL_PATTERN.test(email)) {
    throw new ApiError(400, "Email must be a valid email address");
  }

  next();
}

export function validateContractInput(req, res, next) {
  const { type, amount } = req.body;

  if (!type || !CONTRACT_TYPES.includes(type)) {
    throw new ApiError(400, `type must be one of: ${CONTRACT_TYPES.join(", ")}`);
  }

  if (amount !== undefined && amount !== null && Number(amount) < 0) {
    throw new ApiError(400, "amount cannot be negative");
  }

  next();
}

export function validateCredentialInput(req, res, next) {
  const { service, password } = req.body;

  if (!service || !service.trim()) {
    throw new ApiError(400, "service is required");
  }

  if (!password) {
    throw new ApiError(400, "password is required");
  }

  next();
}

/**
 * PATCH /customers/:id/credentials/:credId — password is optional here (a
 * partial update might only change the username/notes), unlike creation
 * where it's mandatory.
 */
export function validateCredentialUpdateInput(req, res, next) {
  const { service } = req.body;

  if (service !== undefined && !service.trim()) {
    throw new ApiError(400, "service cannot be empty");
  }

  next();
}
