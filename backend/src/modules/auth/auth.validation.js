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
 * Validates the body of POST /auth/forgot-password (§7.17). Deliberately
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
 * Validates the body of POST /auth/reset-password (§7.17).
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

/**
 * A TOTP code or a recovery code — both arrive as `token`, and which one it
 * is is decided by `twoFactor.service.js`, not here. Deliberately loose on
 * format (a 6-digit TOTP and a 10-hex-char recovery code look nothing alike)
 * and strict only on presence.
 */
export function validateTwoFactorTokenInput(req, res, next) {
  const { token } = req.body || {};

  if (!token || typeof token !== "string" || !token.trim()) {
    throw new ApiError(400, "A verification code is required");
  }

  next();
}

/**
 * Validates POST /auth/2fa/disable (2026-08-08) — a user switching off their
 * OWN 2FA. Both fields are required, and the 400s here are the first line of
 * "a session alone is never enough": a request carrying only a valid cookie
 * never reaches the service at all.
 *
 * No `targetUserId`: the endpoint is self-scoped and the controller takes the
 * id from the session, so there is nothing here for a caller to aim elsewhere.
 */
export function validateDisableTwoFactorInput(req, res, next) {
  const { password, token } = req.body || {};

  if (!password) {
    throw new ApiError(400, "Your current password is required to turn off two-factor authentication");
  }

  if (!token) {
    throw new ApiError(400, "A code from your authenticator app, or a recovery code, is required");
  }

  next();
}

export function validateAdminResetInput(req, res, next) {
  const { password, token, targetUserId } = req.body || {};

  if (!targetUserId) {
    throw new ApiError(400, "targetUserId is required");
  }

  if (!password) {
    throw new ApiError(400, "Your own password is required to reset someone else's two-factor authentication");
  }

  if (!token) {
    throw new ApiError(400, "Your own two-factor code is required");
  }

  next();
}

export function validateChangePasswordInput(req, res, next) {
  const { currentPassword, newPassword } = req.body || {};

  if (!currentPassword) {
    throw new ApiError(400, "Your current password is required");
  }

  if (!newPassword || newPassword.length < 8) {
    throw new ApiError(400, "New password must be at least 8 characters");
  }

  if (currentPassword === newPassword) {
    throw new ApiError(400, "Your new password must be different from your current one");
  }

  next();
}
