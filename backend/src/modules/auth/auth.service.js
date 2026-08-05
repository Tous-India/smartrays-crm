import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import ApiError from "../../utils/ApiError.js";
import { env } from "../../config/env.js";
import { sendPasswordResetEmail } from "../../services/email.service.js";
import User from "../user/user.model.js";
import { verifySecondFactor } from "./twoFactor.service.js";
import { isTwoFactorMandatory } from "../../constants/twoFactor.constants.js";

const SALT_ROUNDS = 10;
const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour, per §7.17

// Account creation ("register a user") lives entirely in
// user.service.js#createUser now — auth.controller.js calls it directly.
// This module owns login/logout/session only, so there is exactly one place
// that hashes a password and seeds permissions from a role template, not two.

/**
 * Verifies email/password and issues a JWT for the matching user.
 * The controller is responsible for putting the token in an httpOnly cookie.
 */
export async function loginUser({ email, password }) {
  const user = await User.findOne({ email }).select("+passwordHash");

  if (!user) {
    throw new ApiError(401, "Invalid email or password");
  }

  if (!user.isActive) {
    throw new ApiError(403, "This account has been deactivated");
  }

  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid email or password");
  }

  // §7.38 (2026-08-05) — the security-critical branch. A user with 2FA
  // enabled, or one who is REQUIRED to have it and hasn't enrolled yet, does
  // NOT get a session token here. They get a pre-auth token instead, which
  // authorises the 2FA endpoints and nothing else. The real session cookie is
  // only ever issued after the second factor verifies (or after a mandatory
  // enrolment completes), so a stolen password alone reaches nothing.
  const mustEnrol = isTwoFactorMandatory(user.role) && !user.twoFactorEnabled;

  if (user.twoFactorEnabled || mustEnrol) {
    return {
      user,
      requiresTwoFactor: user.twoFactorEnabled,
      requiresEnrolment: mustEnrol,
      preAuthToken: generatePreAuthToken(user._id),
    };
  }

  return { user, token: generateAuthToken(user._id) };
}

function generateAuthToken(userId) {
  return jwt.sign({ userId }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
}

// Deliberately a DIFFERENT token shape from the session token: `scope:
// "pre_auth"` is what `authenticatePreAuth` checks for, and the ordinary
// `authenticate` middleware rejects anything carrying it. Five minutes is
// long enough to fetch a code from a phone and short enough that an
// intercepted pre-auth token is near-worthless.
export const PRE_AUTH_TOKEN_TTL = "5m";

export function generatePreAuthToken(userId) {
  return jwt.sign({ userId, scope: "pre_auth" }, env.jwtSecret, { expiresIn: PRE_AUTH_TOKEN_TTL });
}

export function issueSessionToken(userId) {
  return generateAuthToken(userId);
}

/**
 * Cookie attributes shared by login (sets the cookie) and logout (clears it).
 * Keeping this in one place means both flows always agree on httpOnly/secure/
 * sameSite, so the browser recognizes logout's clearCookie call as targeting
 * the exact same cookie it set at login.
 *
 * Deliberately excludes maxAge: Express's res.clearCookie() sets its own
 * "expire immediately" default, but only if maxAge is absent from the options
 * — passing a maxAge here would make Express recompute Expires into the
 * future instead of clearing the cookie right away. Login attaches its own
 * maxAge separately via getAuthCookieMaxAgeMs().
 */
export function getAuthCookieOptions() {
  return {
    httpOnly: true,
    secure: env.isProduction,
    // "lax" (2026-07-31, corrected from "none") — the frontend now proxies
    // /api/* to the backend via a Vercel Rewrite (frontend/vercel.json)
    // instead of the browser calling the backend's own separate domain
    // directly, so this cookie is genuinely same-site again: the browser
    // only ever sees requests to its own origin, the backend's actual
    // domain is invisible to it. "none" was a real but fragile fix for the
    // cross-site setup this replaces — confirmed via live testing (WebKit/
    // Safari) that "none" gets silently blocked from storage entirely by
    // third-party-cookie policies regardless of Secure being set; "lax" has
    // no such dependency since there is no cross-site cookie anymore.
    sameSite: "lax",
  };
}

/**
 * How long the login cookie should live, in milliseconds, kept in sync with
 * JWT_EXPIRES_IN so the cookie never outlives the token it holds.
 */
export function getAuthCookieMaxAgeMs() {
  return parseDurationToMs(env.jwtExpiresIn);
}

/**
 * Converts a short duration string like "7d", "12h", "30m" into milliseconds.
 * Falls back to 1 day if the format is not recognized.
 */
function parseDurationToMs(duration) {
  const match = /^(\d+)([smhd])$/.exec(duration);

  if (!match) {
    return 24 * 60 * 60 * 1000;
  }

  const amount = Number(match[1]);
  const unit = match[2];

  const unitToMs = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return amount * unitToMs[unit];
}

/**
 * Self-service "forgot password" (§7.17). ALWAYS resolves with the same
 * generic outcome regardless of whether the email matches an account —
 * callers must never be able to distinguish "no such account" from "email
 * sent" (account enumeration). The real work (generating/storing the token,
 * emailing it) only happens when a matching, active account exists; a
 * deactivated account is treated the same as no account at all, since
 * resetting its password wouldn't let anyone log in anyway.
 *
 * The raw token is only ever emailed, never stored — the DB keeps just its
 * SHA-256 hash, the same one-way-hash reasoning as `passwordHash` itself,
 * so a database compromise alone can't be used to complete a reset.
 */
export async function requestPasswordReset(email) {
  const user = await User.findOne({ email });

  if (!user || !user.isActive) {
    return;
  }

  const rawToken = crypto.randomBytes(32).toString("hex");
  const hashedToken = hashResetToken(rawToken);

  user.passwordResetToken = hashedToken;
  user.passwordResetExpiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS);
  await user.save();

  const resetUrl = `${env.clientOrigin}/reset-password?token=${rawToken}`;
  await sendPasswordResetEmail({ to: user.email, resetUrl });
}

/**
 * Completes a reset: the raw token from the emailed link is hashed and
 * matched against the stored hash, must not be expired, and — once used —
 * is cleared so the same link can't be replayed.
 */
export async function resetPassword(rawToken, newPassword) {
  const hashedToken = hashResetToken(rawToken);

  const user = await User.findOne({ passwordResetToken: hashedToken }).select(
    "+passwordResetToken +passwordResetExpiresAt +passwordHash"
  );

  if (!user || !user.passwordResetExpiresAt || user.passwordResetExpiresAt.getTime() < Date.now()) {
    throw new ApiError(400, "This password reset link is invalid or has expired");
  }

  user.passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  user.passwordResetToken = null;
  user.passwordResetExpiresAt = null;
  await user.save();
}

function hashResetToken(rawToken) {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

/**
 * Password change for one's own account (§7.38). Requires the CURRENT
 * password — without it, anyone who walked up to an unlocked laptop could
 * change the password and lock the real owner out of their own account.
 */
export async function changeOwnPassword(userId, currentPassword, newPassword) {
  const user = await User.findById(userId).select("+passwordHash");

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  const isCurrentValid = await bcrypt.compare(currentPassword || "", user.passwordHash);

  if (!isCurrentValid) {
    throw new ApiError(401, "Your current password is incorrect");
  }

  user.passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await user.save();
}

/**
 * Re-authenticates the acting admin for a privileged action (§7.38's 2FA
 * reset). Deliberately demands BOTH factors again, in the same request:
 * the whole threat being defended against is a session that is already
 * authenticated but not actually in the admin's hands, so re-checking only
 * the session would prove nothing.
 */
export async function reauthenticateActingAdmin(actingAdminId, password, token) {
  const admin = await User.findById(actingAdminId).select("+passwordHash");

  if (!admin) {
    throw new ApiError(404, "User not found");
  }

  const isPasswordValid = await bcrypt.compare(password || "", admin.passwordHash);

  if (!isPasswordValid) {
    throw new ApiError(401, "Your password is incorrect");
  }

  // An admin without 2FA of their own cannot perform this action at all —
  // otherwise "re-authenticate with your second factor" degrades to
  // "re-enter your password", which a compromised session already has.
  if (!admin.twoFactorEnabled) {
    throw new ApiError(
      403,
      "Enable two-factor authentication on your own account before resetting someone else's."
    );
  }

  await verifySecondFactor(admin._id, token);
}
