import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import ApiError from "../../utils/ApiError.js";
import { env } from "../../config/env.js";
import { sendPasswordResetEmail } from "../../services/email.service.js";
import User from "../user/user.model.js";

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

  const token = generateAuthToken(user._id);

  return { user, token };
}

function generateAuthToken(userId) {
  return jwt.sign({ userId }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
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
    // "none" (not "strict") in production: the frontend and backend deploy
    // to separate Vercel domains, so this cookie is genuinely cross-site —
    // "strict"/"lax" would simply never be sent back to the backend at all.
    // Requires `secure: true` (paired above), which browsers enforce for
    // SameSite=None; Vercel serves everything over HTTPS, so that's met.
    sameSite: env.isProduction ? "none" : "lax",
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
