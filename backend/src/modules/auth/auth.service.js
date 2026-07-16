import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import ApiError from "../../utils/ApiError.js";
import { env } from "../../config/env.js";
import User from "../user/user.model.js";

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
    sameSite: env.isProduction ? "strict" : "lax",
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
