import ApiError from "../../utils/ApiError.js";
import { USER_ROLES } from "./user.model.js";
import { PRIVILEGED_FIELDS } from "./user.service.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validates the body of PATCH /users/:id, including the self-vs-admin field
 * restriction — deliberately duplicated here alongside the authoritative
 * check in user.service.js#updateUser, as defense in depth: if the service
 * check is ever changed or bypassed in a future refactor, this still blocks
 * the request before it reaches the service at all. Not a replacement for
 * the service-layer check, which remains the source of truth.
 */
export function validateUpdateUserInput(req, res, next) {
  const { name, email, role, isActive, managerId, baseSalary, customerId } = req.body;

  if (name !== undefined && !name.trim()) {
    throw new ApiError(400, "Name cannot be empty");
  }

  if (email !== undefined && !EMAIL_PATTERN.test(email)) {
    throw new ApiError(400, "Email must be a valid email address");
  }

  if (role !== undefined && !USER_ROLES.includes(role)) {
    throw new ApiError(400, `Role must be one of: ${USER_ROLES.join(", ")}`);
  }

  if (isActive !== undefined && typeof isActive !== "boolean") {
    throw new ApiError(400, "isActive must be a boolean");
  }

  if (managerId !== undefined && managerId !== null && typeof managerId !== "string") {
    throw new ApiError(400, "managerId must be a string id or null");
  }

  if (baseSalary !== undefined && baseSalary !== null && (typeof baseSalary !== "number" || baseSalary < 0)) {
    throw new ApiError(400, "baseSalary must be a non-negative number or null");
  }

  if (customerId !== undefined && customerId !== null && typeof customerId !== "string") {
    throw new ApiError(400, "customerId must be a string id or null");
  }

  const isSelf = String(req.params.id) === String(req.user._id);
  const isAdmin = req.user.role === "admin";

  if (!isSelf && !isAdmin) {
    throw new ApiError(403, "You do not have permission to update this user");
  }

  const attemptedPrivilegedField = PRIVILEGED_FIELDS.find((field) => req.body[field] !== undefined);

  if (attemptedPrivilegedField && !isAdmin) {
    throw new ApiError(403, `Only an admin can update "${attemptedPrivilegedField}"`);
  }

  next();
}

/**
 * Validates the body of PATCH /users/:id/reset-password (§7.13, admin
 * override). `newPassword` is optional — see user.service.js#adminResetPassword
 * for the "supplied vs. generated temp password" behavior; when supplied, it
 * must meet the same minimum-length rule as every other password in the app.
 */
export function validateAdminResetPasswordInput(req, res, next) {
  const { newPassword } = req.body;

  if (newPassword !== undefined && (typeof newPassword !== "string" || newPassword.length < 8)) {
    throw new ApiError(400, "newPassword must be a string of at least 8 characters");
  }

  next();
}

/**
 * Validates the body of PATCH /users/:id/manager.
 */
export function validateAssignManagerInput(req, res, next) {
  const { managerId } = req.body;

  if (managerId !== undefined && managerId !== null && typeof managerId !== "string") {
    throw new ApiError(400, "managerId must be a string id or null");
  }

  next();
}
