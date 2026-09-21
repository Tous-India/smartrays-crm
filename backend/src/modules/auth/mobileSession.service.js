import crypto from "crypto";
import jwt from "jsonwebtoken";
import ApiError from "../../utils/ApiError.js";
import { env } from "../../config/env.js";
import { SESSION_EXPIRED_CODE } from "../../middlewares/authenticate.middleware.js";
import RefreshToken from "./refreshToken.model.js";
import User from "../user/user.model.js";

/**
 * Mobile sessions (mobile-backend-plan.md §1.3c): a short-lived access token
 * plus a long-lived, server-side, rotating refresh token.
 *
 * The ACCESS token is a JWT of the same `{ userId }` shape as the web session
 * token, so `authenticate` verifies both with one code path; `aud: "mobile"`
 * only tells them apart in a log line. The REFRESH token is never a JWT — it
 * must be revocable, so it is 32 random bytes whose SHA-256 is the stored
 * record. The two are different formats, so neither can be mistaken for the
 * other: a refresh token fails `jwt.verify`, and an access token hashes to
 * nothing in the collection.
 *
 * The web app never calls anything in this file.
 */

const REFRESH_TOKEN_BYTES = 32;

function sessionExpired(message) {
  return new ApiError(401, message, [{ code: SESSION_EXPIRED_CODE }]);
}

function hashRefreshToken(rawToken) {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

function generateRawRefreshToken() {
  return crypto.randomBytes(REFRESH_TOKEN_BYTES).toString("base64url");
}

function generateAccessToken(userId) {
  return jwt.sign({ userId, aud: "mobile" }, env.jwtSecret, { expiresIn: env.mobileAccessTokenTtl });
}

/**
 * "15m" / "1h" / "7d" → seconds. Kept local rather than shared with
 * auth.service.js's cookie-lifetime parser: that file calls this one on
 * password change, and importing back the other way would make a cycle.
 */
function durationToSeconds(duration) {
  const match = /^(\d+)([smhd])$/.exec(duration);

  if (!match) {
    return 15 * 60;
  }

  const unitToSeconds = { s: 1, m: 60, h: 60 * 60, d: 24 * 60 * 60 };

  return Number(match[1]) * unitToSeconds[match[2]];
}

/** Access-token lifetime in whole seconds — what the app schedules against. */
export function getAccessTokenLifetimeSeconds() {
  return durationToSeconds(env.mobileAccessTokenTtl);
}

function getRefreshTokenExpiry() {
  return new Date(Date.now() + env.mobileRefreshTokenTtlDays * 24 * 60 * 60 * 1000);
}

/**
 * Writes a new refresh-token record and returns the pair the app stores.
 * `device` is what the app sends about itself; both fields are optional and
 * only make logout and reuse detection act on one device instead of all.
 */
async function issueTokenPair(userId, device = {}) {
  const rawRefreshToken = generateRawRefreshToken();

  await RefreshToken.create({
    userId,
    tokenHash: hashRefreshToken(rawRefreshToken),
    deviceId: device.deviceId || null,
    deviceLabel: device.deviceLabel || "Unknown device",
    expiresAt: getRefreshTokenExpiry(),
  });

  return {
    accessToken: generateAccessToken(userId),
    accessExpiresIn: getAccessTokenLifetimeSeconds(),
    refreshToken: rawRefreshToken,
  };
}

/**
 * Starts a mobile session for a user whose password (and second factor, when
 * required) has ALREADY been verified by the same service functions the web
 * login uses. This only mints the transport.
 */
export async function issueMobileSession(userId, device = {}) {
  return issueTokenPair(userId, device);
}

/**
 * Exchanges a refresh token for a fresh pair and retires the presented one.
 *
 * Reuse detection: a token that has already been replaced is presented again
 * only when it was stolen or the app lost its write. Either way the device's
 * whole chain is revoked and the app is sent back to login. Revoked and
 * expired tokens answer SESSION_EXPIRED too — the same code the web keys its
 * "go to login" on. A deactivated account answers 403, deliberately NOT
 * SESSION_EXPIRED, so the app can tell "sign in again" from "you can't".
 */
export async function rotateRefreshToken(rawRefreshToken) {
  const record = await RefreshToken.findOne({ tokenHash: hashRefreshToken(rawRefreshToken) });

  if (!record) {
    throw sessionExpired("Your session is no longer valid. Please sign in again.");
  }

  const user = await User.findById(record.userId);

  if (!user) {
    throw sessionExpired("User no longer exists.");
  }

  // Checked before the token's own state on purpose: deactivation also
  // revokes the token, and "deactivated" is the answer the app must hear.
  if (!user.isActive) {
    throw new ApiError(403, "This account has been deactivated.");
  }

  if (record.replacedByHash) {
    await revokeDeviceRefreshTokens(record.userId, record.deviceId);
    throw sessionExpired("Your session is no longer valid. Please sign in again.");
  }

  if (record.revokedAt) {
    throw sessionExpired("You have been signed out. Please sign in again.");
  }

  if (record.expiresAt.getTime() <= Date.now()) {
    throw sessionExpired("Your session has expired. Please sign in again.");
  }

  const pair = await issueTokenPair(user._id, { deviceId: record.deviceId, deviceLabel: record.deviceLabel });

  record.replacedByHash = hashRefreshToken(pair.refreshToken);
  record.lastUsedAt = new Date();
  await record.save();

  return pair;
}

/**
 * Logout: revokes ONE refresh token, and only if it belongs to the caller —
 * a token that is not theirs is simply not revoked, never an error, so
 * logout cannot be used to probe for other users' tokens.
 */
export async function revokeRefreshToken(userId, rawRefreshToken) {
  await RefreshToken.updateOne(
    { userId, tokenHash: hashRefreshToken(rawRefreshToken), revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );
}

/**
 * Revokes every live refresh token of one device — the reuse-detection
 * response. With no device id recorded the whole account is revoked instead:
 * without one there is no way to tell that device's tokens from the rest.
 */
export async function revokeDeviceRefreshTokens(userId, deviceId) {
  const filter = deviceId ? { userId, deviceId, revokedAt: null } : { userId, revokedAt: null };

  await RefreshToken.updateMany(filter, { $set: { revokedAt: new Date() } });
}

/**
 * Revokes every live refresh token a user holds. Called on password change,
 * admin password reset and deactivation — a no-op for a user who has never
 * signed in on the app, which is every web-only user today.
 */
export async function revokeAllRefreshTokens(userId) {
  await RefreshToken.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: new Date() } });
}
