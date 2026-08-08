import { Router } from "express";
import {
  register,
  login,
  logout,
  getCurrentUser,
  customerSignup,
  forgotPassword,
  resetPasswordWithToken,
  verifyTwoFactor,
  startTwoFactorEnrolment,
  confirmTwoFactorEnrolment,
  regenerateTwoFactorRecoveryCodes,
  adminResetTwoFactor,
  disableTwoFactor,
  changePassword,
  getTrustedDevices,
  revokeOneTrustedDevice,
  revokeEveryTrustedDevice,
} from "./auth.controller.js";
import {
  validateRegisterInput,
  validateLoginInput,
  validateCustomerSignupInput,
  validateForgotPasswordInput,
  validateResetPasswordInput,
  validateTwoFactorTokenInput,
  validateAdminResetInput,
  validateDisableTwoFactorInput,
  validateChangePasswordInput,
} from "./auth.validation.js";
import authenticate, { authenticatePreAuth } from "../../middlewares/authenticate.middleware.js";
import { requireAdmin } from "../../middlewares/authorize.middleware.js";

const authRouter = Router();

// `authenticateEither` (session OR pre-auth token, for the enrolment routes)
// was removed 2026-08-08 with the mandatory-enrolment gate. Its only reason to
// exist was letting an admin/manager enrol while holding nothing but a
// pre-auth token; enrolment is now purely post-authentication, so those routes
// take a full session like every other self-service action.

// Internal tool — no public self-registration for staff roles. Only a
// logged-in admin can create admin/manager/sales_associate/employee
// accounts. The very first admin is created by the seed:admin script (see
// backend/README.md), not through this endpoint.
authRouter.post("/register", authenticate, requireAdmin, validateRegisterInput, register);

// Customer Portal self-signup (§7.8) — deliberately separate from the
// admin-gated /register above, not overloaded onto it: public (no
// authenticate/requireAdmin), and the real gate is the email-domain match
// inside createCustomerSelfSignupUser, not an admin grant.
authRouter.post("/customer/signup", validateCustomerSignupInput, customerSignup);

authRouter.post("/login", validateLoginInput, login);
authRouter.post("/logout", authenticate, logout);
authRouter.get("/me", authenticate, getCurrentUser);

// Self-service password reset (§7.17) — both public, no authenticate: a
// user who forgot their password is by definition not logged in, and the
// reset token itself (not a session) is what authorizes /reset-password.
authRouter.post("/forgot-password", validateForgotPasswordInput, forgotPassword);
authRouter.post("/reset-password", validateResetPasswordInput, resetPasswordWithToken);

// --- Two-factor authentication (§7.38, 2026-08-05) ---
//
// The `authenticatePreAuth` routes are the ONLY thing a pre-auth token can
// reach. It is not a cookie, so the browser never sends it anywhere else,
// and `authenticate` rejects it outright if one ever appears in the auth
// cookie — the two middlewares accept strictly disjoint token scopes.
authRouter.post("/2fa/verify", authenticatePreAuth, validateTwoFactorTokenInput, verifyTwoFactor);

// Enrolment — full session only. 2FA is opt-in for every role, so enrolling is
// something a signed-in user chooses to do, never a hurdle they are held at.
authRouter.post("/2fa/enrol/start", authenticate, startTwoFactorEnrolment);
authRouter.post("/2fa/enrol/confirm", authenticate, validateTwoFactorTokenInput, confirmTwoFactorEnrolment);

// Turning your OWN 2FA off. `authenticate` is necessary but deliberately NOT
// sufficient — the controller/service also demand the current password and a
// live second factor, because the attacker this protects against is precisely
// someone holding a session they shouldn't. Self-scoped: no target id is read
// from the body.
authRouter.post("/2fa/disable", authenticate, validateDisableTwoFactorInput, disableTwoFactor);

authRouter.post("/2fa/recovery-codes", authenticate, regenerateTwoFactorRecoveryCodes);

// Admin resetting SOMEONE ELSE's 2FA — re-authentication is enforced inside
// the controller, not here, because it needs the request body.
authRouter.post("/2fa/admin-reset", authenticate, requireAdmin, validateAdminResetInput, adminResetTwoFactor);

authRouter.post("/change-password", authenticate, validateChangePasswordInput, changePassword);

// --- Trusted devices (§7.40, 2026-08-05) ---
//
// All three are `authenticate` (full session) only — never `authenticatePreAuth`.
// Managing which devices skip the second factor is itself a post-authentication
// action; reaching it with a pre-auth token would let a half-authenticated
// caller inspect or grant that trust.
authRouter.get("/trusted-devices", authenticate, getTrustedDevices);
authRouter.delete("/trusted-devices/:id", authenticate, revokeOneTrustedDevice);
authRouter.delete("/trusted-devices", authenticate, revokeEveryTrustedDevice);

export default authRouter;
