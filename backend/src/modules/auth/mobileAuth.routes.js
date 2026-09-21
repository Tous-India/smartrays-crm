import { Router } from "express";
import { mobileLogin, mobileVerifyTwoFactor, mobileRefresh, mobileLogout } from "./mobileAuth.controller.js";
import { validateLoginInput, validateTwoFactorTokenInput } from "./auth.validation.js";
import { validateRefreshTokenInput, validateDeviceFieldsInput } from "./mobileAuth.validation.js";
import authenticate, { authenticatePreAuth } from "../../middlewares/authenticate.middleware.js";

/**
 * /auth/mobile/* (mobile-backend-plan.md §1.3b) — the app's sibling routes.
 * Mounted beside `/auth`, not inside it, so auth.routes.js stays exactly as
 * the web left it. The validators are the web's own where the body is the
 * same (login, 2FA code); only the refresh token and the device fields are
 * new.
 */
const mobileAuthRouter = Router();

mobileAuthRouter.post("/login", validateLoginInput, validateDeviceFieldsInput, mobileLogin);

// The pre-auth token arrives as Bearer exactly as it does on the web —
// `authenticatePreAuth` is reused unchanged.
mobileAuthRouter.post(
  "/2fa/verify",
  authenticatePreAuth,
  validateTwoFactorTokenInput,
  validateDeviceFieldsInput,
  mobileVerifyTwoFactor
);

// No session required: the refresh token IS the credential here, and the
// access token it replaces has usually expired by the time this is called.
mobileAuthRouter.post("/refresh", validateRefreshTokenInput, mobileRefresh);

// A live access token (Bearer) plus the refresh token to revoke. The
// access token keeps working until it expires — the reason it lives 15 minutes.
mobileAuthRouter.post("/logout", authenticate, validateRefreshTokenInput, mobileLogout);

export default mobileAuthRouter;
