import asyncWrapper from "../../utils/asyncWrapper.js";
import {
  verifySecondFactor,
  beginTotpEnrolment,
  confirmTotpEnrolment,
  regenerateRecoveryCodes,
  clearTwoFactor,
} from "./twoFactor.service.js";
import ApiResponse from "../../utils/ApiResponse.js";
import { env } from "../../config/env.js";
import { createUser, createCustomerSelfSignupUser } from "../user/user.service.js";
import {
  loginUser,
  getAuthCookieOptions,
  getAuthCookieMaxAgeMs,
  requestPasswordReset,
  resetPassword,
  issueSessionToken,
  changeOwnPassword,
  reauthenticateActingAdmin,
} from "./auth.service.js";

export const register = asyncWrapper(async (req, res) => {
  const { name, email, phone, password, role, managerId, customerId } = req.body;

  const user = await createUser({ name, email, phone, password, role, managerId, customerId });

  res.status(201).json(new ApiResponse(201, user, "User registered successfully"));
});

// Public — no authenticate/requireAdmin, unlike register above. §7.8's
// Customer Portal accounts are self-signed-up, not admin-created; the
// email-domain match inside createCustomerSelfSignupUser is the actual gate,
// not an admin grant.
export const customerSignup = asyncWrapper(async (req, res) => {
  const { name, email, password } = req.body;

  const user = await createCustomerSelfSignupUser({ name, email, password });

  res.status(201).json(new ApiResponse(201, user, "Account created successfully"));
});

export const login = asyncWrapper(async (req, res) => {
  const { email, password } = req.body;

  const result = await loginUser({ email, password });

  // §7.38 — THE security-critical branch. When a second factor is still
  // outstanding, NO session cookie is set: the response carries only a
  // short-lived pre-auth token, which authorises the 2FA endpoints and
  // nothing else. A stolen password therefore yields no session at all.
  if (result.preAuthToken) {
    return res.status(200).json(
      new ApiResponse(
        200,
        {
          requiresTwoFactor: result.requiresTwoFactor,
          requiresEnrolment: result.requiresEnrolment,
          preAuthToken: result.preAuthToken,
          // Enough to render the next screen; never the secrets.
          email: result.user.email,
          name: result.user.name,
        },
        result.requiresEnrolment
          ? "Two-factor authentication is required for your role. Please enrol to continue."
          : "Enter your two-factor code to finish signing in"
      )
    );
  }

  res.cookie(env.cookieName, result.token, {
    ...getAuthCookieOptions(),
    maxAge: getAuthCookieMaxAgeMs(),
  });

  res.status(200).json(new ApiResponse(200, result.user, "Logged in successfully"));
});

export const logout = asyncWrapper(async (req, res) => {
  res.clearCookie(env.cookieName, getAuthCookieOptions());

  res.status(200).json(new ApiResponse(200, null, "Logged out successfully"));
});

export const getCurrentUser = asyncWrapper(async (req, res) => {
  res.status(200).json(new ApiResponse(200, req.user, "Current user fetched successfully"));
});

// Always the same generic response, whether or not the email matches an
// account — see auth.service.js#requestPasswordReset's account-enumeration
// note. The controller never sees which branch the service took.
export const forgotPassword = asyncWrapper(async (req, res) => {
  const { email } = req.body;

  await requestPasswordReset(email);

  res
    .status(200)
    .json(new ApiResponse(200, null, "If an account with that email exists, a reset link has been sent"));
});

export const resetPasswordWithToken = asyncWrapper(async (req, res) => {
  const { token, newPassword } = req.body;

  await resetPassword(token, newPassword);

  res.status(200).json(new ApiResponse(200, null, "Password reset successfully"));
});

// --- Two-factor authentication (§7.38, 2026-08-05) ---

/**
 * Issues the real session cookie. Used by the 2FA verify and mandatory-
 * enrolment endpoints — the ONLY places a session may begin once a second
 * factor is involved. Mirrors `login`'s own cookie call exactly so both
 * flows produce an identical cookie (httpOnly / SameSite / secure), which
 * `logout`'s clearCookie then matches.
 */
function issueSession(res, userId) {
  res.cookie(env.cookieName, issueSessionToken(userId), {
    ...getAuthCookieOptions(),
    maxAge: getAuthCookieMaxAgeMs(),
  });
}

export const verifyTwoFactor = asyncWrapper(async (req, res) => {
  const user = req.preAuthUser;

  try {
    const result = await verifySecondFactor(user._id, req.body.token);

    issueSession(res, user._id);

    res.status(200).json(new ApiResponse(200, { user, ...result }, "Signed in successfully"));
  } catch (error) {
    // A lockout must invalidate the whole attempt, not just this request —
    // otherwise the pre-auth token stays valid and an attacker keeps
    // retrying. There is nothing to clear server-side (the token is
    // stateless), so the 429 is the signal to the client to restart, and
    // `twoFactorFailedAttempts` keeps blocking until a fresh login resets it.
    throw error;
  }
});

export const startTwoFactorEnrolment = asyncWrapper(async (req, res) => {
  // Reachable either by a logged-in user enrolling voluntarily, or by an
  // admin/manager caught by the mandatory-enrolment gate who has only a
  // pre-auth token so far.
  const user = req.user || req.preAuthUser;
  const enrolment = await beginTotpEnrolment(user._id);

  res.status(200).json(new ApiResponse(200, enrolment, "Scan this in your authenticator app"));
});

export const confirmTwoFactorEnrolment = asyncWrapper(async (req, res) => {
  const user = req.user || req.preAuthUser;
  const result = await confirmTotpEnrolment(user._id, req.body.token);

  // Enrolling THROUGH the mandatory gate completes the sign-in: the user has
  // now proven both factors, so withholding the session would strand them.
  if (!req.user && req.preAuthUser) {
    issueSession(res, user._id);
  }

  res
    .status(200)
    .json(new ApiResponse(200, result, "Two-factor authentication enabled. Save your recovery codes."));
});

export const regenerateTwoFactorRecoveryCodes = asyncWrapper(async (req, res) => {
  const result = await regenerateRecoveryCodes(req.user._id);

  res.status(200).json(new ApiResponse(200, result, "New recovery codes generated. The old ones no longer work."));
});

/**
 * Admin resets ANOTHER user's 2FA. The acting admin must re-authenticate
 * with their own password AND their own current 2FA code in this same
 * request — a compromised admin session must not be able to silently strip
 * another admin's second factor. Every reset is logged with actor and target.
 */
export const adminResetTwoFactor = asyncWrapper(async (req, res) => {
  const { password, token, targetUserId } = req.body;

  await reauthenticateActingAdmin(req.user._id, password, token);
  await clearTwoFactor(targetUserId);

  console.warn(
    `[2FA RESET] actor=${req.user._id} (${req.user.email}) target=${targetUserId} at=${new Date().toISOString()}`
  );

  res.status(200).json(new ApiResponse(200, null, "That user's two-factor authentication has been reset"));
});

export const changePassword = asyncWrapper(async (req, res) => {
  await changeOwnPassword(req.user._id, req.body.currentPassword, req.body.newPassword);

  res.status(200).json(new ApiResponse(200, null, "Password changed successfully"));
});
