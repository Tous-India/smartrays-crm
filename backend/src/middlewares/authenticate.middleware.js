import jwt from "jsonwebtoken";
import ApiError from "../utils/ApiError.js";
import asyncWrapper from "../utils/asyncWrapper.js";
import { env } from "../config/env.js";
import User from "../modules/user/user.model.js";

/**
 * Marks a 401 as "the credential identifying you is gone" rather than "the
 * secret you just typed was wrong" (2026-08-08).
 *
 * A 401 means both things in this API, and the frontend could not tell them
 * apart: its interceptor redirected to /login on every 401 except
 * `/auth/login`, so a mistyped password on an otherwise healthy session signed
 * the user out instead of showing the message the server had already sent.
 * Confirmed live on 2FA-disable — the modal unmounted before the error could
 * render, which is why it read as "the switch doesn't work".
 *
 * The frontend now redirects ONLY on this code, and everything else propagates
 * to the caller. That direction matters: the redirect is a positive assertion
 * by the server, not a growing list of exemptions on the client — an
 * exemption list is exactly how this stayed hidden. A new credential-checking
 * endpoint is therefore safe by default, and a new session check has to opt in
 * here, next to the other seven.
 *
 * EVERY session-expiry 401 in this codebase is thrown from this file, which is
 * what makes one helper sufficient.
 */
export const SESSION_EXPIRED_CODE = "SESSION_EXPIRED";

function sessionExpired(message) {
  return new ApiError(401, message, [{ code: SESSION_EXPIRED_CODE }]);
}

/**
 * Verifies the JWT stored in the httpOnly auth cookie and attaches the
 * matching user document to req.user. Must run before authorize() or any
 * route that reads req.user.
 */
const authenticate = asyncWrapper(async (req, res, next) => {
  const token = req.cookies[env.cookieName];

  if (!token) {
    throw sessionExpired("Authentication required. Please log in.");
  }

  let decodedToken;

  try {
    decodedToken = jwt.verify(token, env.jwtSecret);
  } catch (error) {
    throw sessionExpired("Invalid or expired session. Please log in again.");
  }

  // §7.38 — defence in depth. A pre-auth token is only ever returned in a
  // response BODY, never set as a cookie, so it cannot normally reach here at
  // all. This rejects it explicitly anyway: if one ever were placed in the
  // auth cookie, it must NOT be accepted as a session, or the second factor
  // would be bypassable by moving a token between transports.
  if (decodedToken.scope === "pre_auth") {
    throw sessionExpired("Two-factor verification is not complete. Please sign in again.");
  }

  const user = await User.findById(decodedToken.userId);

  if (!user) {
    throw sessionExpired("User no longer exists.");
  }

  if (!user.isActive) {
    throw new ApiError(403, "This account has been deactivated.");
  }

  // The per-request mandatory-2FA gate that used to live here was removed
  // 2026-08-08: 2FA is opt-in for every role now, so there is no enrolment to
  // enforce and nothing to exempt from it. Authentication is back to being
  // exactly one question — is this a valid session for a live, active user.
  req.user = user;
  next();
});

export default authenticate;


/**
 * Authorises ONLY the 2FA endpoints, using the short-lived pre-auth token
 * issued by login when a second factor is still outstanding (§7.38).
 *
 * Read from an `Authorization: Bearer` header rather than a cookie, on
 * purpose: it keeps the half-authenticated state completely out of the
 * browser's cookie jar, so it can never be sent automatically to any other
 * endpoint. A token without `scope: "pre_auth"` is rejected here, exactly as
 * `authenticate` rejects one WITH it — the two are strictly disjoint, so a
 * full session token can't be used to skip enrolment either.
 */
export const authenticatePreAuth = asyncWrapper(async (req, res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;

  if (!token) {
    throw sessionExpired("Two-factor session missing. Please sign in again.");
  }

  let decodedToken;

  try {
    decodedToken = jwt.verify(token, env.jwtSecret);
  } catch (error) {
    throw sessionExpired("Your sign-in attempt expired. Please sign in again.");
  }

  if (decodedToken.scope !== "pre_auth") {
    throw sessionExpired("Invalid two-factor session.");
  }

  const user = await User.findById(decodedToken.userId);

  if (!user || !user.isActive) {
    throw sessionExpired("User no longer exists.");
  }

  req.preAuthUser = user;
  next();
});
