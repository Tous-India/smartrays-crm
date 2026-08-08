import asyncWrapper from "../../utils/asyncWrapper.js";
import {
  verifySecondFactor,
  beginTotpEnrolment,
  confirmTotpEnrolment,
  regenerateRecoveryCodes,
  clearTwoFactor,
  disableOwnTwoFactor,
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
import {
  rememberDevice,
  listTrustedDevices,
  revokeTrustedDevice,
  revokeAllTrustedDevices,
  getTrustedDeviceCookieName,
  getTrustedDeviceMaxAgeMs,
} from "./trustedDevice.service.js";

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

  const result = await loginUser({
    email,
    password,
    // §7.40 — read but never trusted on its own. `loginUser` only consults it
    // AFTER the password above has been verified, so this can skip the second
    // factor and never the first.
    trustedDeviceToken: req.cookies?.[getTrustedDeviceCookieName()],
  });

  // §7.38 — THE security-critical branch. When a second factor is still
  // outstanding, NO session cookie is set: the response carries only a
  // short-lived pre-auth token, which authorises the 2FA endpoints and
  // nothing else. A stolen password therefore yields no session at all.
  if (result.preAuthToken) {
    // A device cookie was presented and did NOT match (revoked, expired, or
    // belonging to a different account). Clear it so the browser stops
    // sending a dead credential on every future login.
    if (req.cookies?.[getTrustedDeviceCookieName()]) {
      clearTrustedDeviceCookie(res);
    }

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          requiresTwoFactor: result.requiresTwoFactor,
          preAuthToken: result.preAuthToken,
          // Enough to render the next screen; never the secrets.
          email: result.user.email,
          name: result.user.name,
        },
        "Enter your two-factor code to finish signing in"
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
  // Only the session cookie. The trusted-device cookie deliberately SURVIVES
  // logout — "remember this device" would be meaningless if signing out
  // discarded it. It is cleared by revocation, password change, or expiry.
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

/**
 * §7.40 — the trusted-device cookie. Deliberately built from the SAME
 * `getAuthCookieOptions()` as the session cookie rather than a new set of
 * options: that config (httpOnly, SameSite=Lax, same-origin through the
 * Vercel rewrite proxy) is load-bearing and was arrived at the hard way. The
 * ONLY difference here is `maxAge` — 30 days rather than the session's.
 */
function issueTrustedDeviceCookie(res, rawToken) {
  res.cookie(getTrustedDeviceCookieName(), rawToken, {
    ...getAuthCookieOptions(),
    maxAge: getTrustedDeviceMaxAgeMs(),
  });
}

function clearTrustedDeviceCookie(res) {
  res.clearCookie(getTrustedDeviceCookieName(), getAuthCookieOptions());
}

export const verifyTwoFactor = asyncWrapper(async (req, res) => {
  const user = req.preAuthUser;

  try {
    const result = await verifySecondFactor(user._id, req.body.token);

    issueSession(res, user._id);

    // §7.40 — opt-in, and only on a TOTP verification. A recovery code means
    // the user lost their authenticator, which is exactly why
    // `verifySecondFactor` has just revoked every trusted device; minting a
    // fresh one in the same breath would undo that. They can tick the box on
    // their next normal sign-in, once the authenticator is back.
    if (req.body.rememberDevice === true && result.method === "totp") {
      const rawToken = await rememberDevice(user._id, req.get("user-agent"));

      if (rawToken) {
        issueTrustedDeviceCookie(res, rawToken);
      }
    } else if (result.method === "recovery_code") {
      clearTrustedDeviceCookie(res);
    }

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
  // Session-only since 2026-08-08. It used to also accept a pre-auth token,
  // for an admin/manager held at the mandatory-enrolment gate; with the gate
  // gone, enrolment is purely a post-authentication action and there is no
  // longer any legitimate way to reach it half-authenticated.
  const enrolment = await beginTotpEnrolment(req.user._id);

  res.status(200).json(new ApiResponse(200, enrolment, "Scan this in your authenticator app"));
});

export const confirmTwoFactorEnrolment = asyncWrapper(async (req, res) => {
  const result = await confirmTotpEnrolment(req.user._id, req.body.token);

  // Audited to the same standard as the admin reset below: turning the second
  // factor ON or OFF are both changes to how an account authenticates, and a
  // record of only one of them tells half a story.
  console.warn(
    `[2FA ENABLED] actor=${req.user._id} (${req.user.email}) at=${new Date().toISOString()}`
  );

  res
    .status(200)
    .json(new ApiResponse(200, result, "Two-factor authentication enabled. Save your recovery codes."));
});

/**
 * A user turning OFF their own 2FA (2026-08-08).
 *
 * The id comes from `req.user` — the authenticated session — and NEVER from
 * the body. Any `targetUserId`/`userId` a caller sends is ignored outright, so
 * there is no path here for one user to disable another's. The only cross-user
 * path remains `adminResetTwoFactor` below, which is unchanged.
 */
export const disableTwoFactor = asyncWrapper(async (req, res) => {
  const { password, token } = req.body;

  await disableOwnTwoFactor(req.user._id, password, token);

  console.warn(
    `[2FA DISABLED] actor=${req.user._id} (${req.user.email}) at=${new Date().toISOString()}`
  );

  res
    .status(200)
    .json(
      new ApiResponse(200, null, "Two-factor authentication is off. Every trusted device has been signed out.")
    );
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
  // The service revokes every trusted device server-side; this also drops the
  // now-dead cookie held by the browser making the change.
  await changeOwnPassword(req.user._id, req.body.currentPassword, req.body.newPassword);
  clearTrustedDeviceCookie(res);

  res
    .status(200)
    .json(new ApiResponse(200, null, "Password changed successfully. Trusted devices were signed out."));
});

// --- Trusted devices (§7.40, 2026-08-05) ---

export const getTrustedDevices = asyncWrapper(async (req, res) => {
  const devices = await listTrustedDevices(req.user._id);

  res.status(200).json(new ApiResponse(200, devices, "Trusted devices fetched successfully"));
});

/**
 * Always scoped to `req.user._id` — the id in the URL identifies a device
 * WITHIN the caller's own list, so passing someone else's device id simply
 * matches nothing. There is no cross-user reachability to guard.
 */
export const revokeOneTrustedDevice = asyncWrapper(async (req, res) => {
  await revokeTrustedDevice(req.user._id, req.params.id);

  res.status(200).json(new ApiResponse(200, null, "That device will need a code next time"));
});

export const revokeEveryTrustedDevice = asyncWrapper(async (req, res) => {
  await revokeAllTrustedDevices(req.user._id);
  clearTrustedDeviceCookie(res);

  res.status(200).json(new ApiResponse(200, null, "All devices will need a code next time"));
});
