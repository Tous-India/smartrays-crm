import ApiError from "../../utils/ApiError.js";
import { USER_ROLES } from "../user/user.model.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validates the body of POST /auth/register before the controller runs.
 */
export function validateRegisterInput(req, res, next) {
  const { name, email, password, role } = req.body;

  if (!name || !name.trim()) {
    throw new ApiError(400, "Name is required");
  }

  if (!email || !EMAIL_PATTERN.test(email)) {
    throw new ApiError(400, "A valid email is required");
  }

  if (!password || password.length < 8) {
    throw new ApiError(400, "Password must be at least 8 characters long");
  }

  if (!role || !USER_ROLES.includes(role)) {
    throw new ApiError(400, `Role must be one of: ${USER_ROLES.join(", ")}`);
  }

  next();
}

/**
 * Validates the body of POST /auth/login before the controller runs.
 */
export function validateLoginInput(req, res, next) {
  const { email, password } = req.body;

  if (!email || !EMAIL_PATTERN.test(email)) {
    throw new ApiError(400, "A valid email is required");
  }

  if (!password) {
    throw new ApiError(400, "Password is required");
  }

  next();
}

/**
 * Validates the body of POST /auth/forgot-password (§7.13). Deliberately
 * accepts any syntactically valid email without checking whether it matches
 * an account — that check (and its non-leaking generic response either way)
 * lives entirely in auth.service.js#requestPasswordReset.
 */
export function validateForgotPasswordInput(req, res, next) {
  const { email } = req.body;

  if (!email || !EMAIL_PATTERN.test(email)) {
    throw new ApiError(400, "A valid email is required");
  }

  next();
}

/**
 * Validates the body of POST /auth/reset-password (§7.13).
 */
export function validateResetPasswordInput(req, res, next) {
  const { token, newPassword } = req.body;

  if (!token || typeof token !== "string") {
    throw new ApiError(400, "A reset token is required");
  }

  if (!newPassword || newPassword.length < 8) {
    throw new ApiError(400, "Password must be at least 8 characters long");
  }

  next();
}

/**
 * Validates the body of POST /auth/customer/signup (§7.8) — deliberately
 * separate from validateRegisterInput: there's no `role` field here at all
 * (always "customer", never caller-supplied), and the email-domain match
 * itself (the real gate) happens in the service layer, not here.
 */
export function validateCustomerSignupInput(req, res, next) {
  const { name, email, password } = req.body;

  if (!name || !name.trim()) {
    throw new ApiError(400, "Name is required");
  }

  if (!email || !EMAIL_PATTERN.test(email)) {
    throw new ApiError(400, "A valid email is required");
  }

  if (!password || password.length < 8) {
    throw new ApiError(400, "Password must be at least 8 characters long");
  }

  next();
}
