import jwt from "jsonwebtoken";
import ApiError from "../utils/ApiError.js";
import asyncWrapper from "../utils/asyncWrapper.js";
import { env } from "../config/env.js";
import User from "../modules/user/user.model.js";
import { isTwoFactorMandatory } from "../constants/twoFactor.constants.js";

/**
 * Verifies the JWT stored in the httpOnly auth cookie and attaches the
 * matching user document to req.user. Must run before authorize() or any
 * route that reads req.user.
 */
const authenticate = asyncWrapper(async (req, res, next) => {
  const token = req.cookies[env.cookieName];

  if (!token) {
    throw new ApiError(401, "Authentication required. Please log in.");
  }

  let decodedToken;

  try {
    decodedToken = jwt.verify(token, env.jwtSecret);
  } catch (error) {
    throw new ApiError(401, "Invalid or expired session. Please log in again.");
  }

  // §7.38 — defence in depth. A pre-auth token is only ever returned in a
  // response BODY, never set as a cookie, so it cannot normally reach here at
  // all. This rejects it explicitly anyway: if one ever were placed in the
  // auth cookie, it must NOT be accepted as a session, or the second factor
  // would be bypassable by moving a token between transports.
  if (decodedToken.scope === "pre_auth") {
    throw new ApiError(401, "Two-factor verification is not complete. Please sign in again.");
  }

  const user = await User.findById(decodedToken.userId);

  if (!user) {
    throw new ApiError(401, "User no longer exists.");
  }

  if (!user.isActive) {
    throw new ApiError(403, "This account has been deactivated.");
  }

  // §7.38 enforcement — "mandatory" has to be enforced on EVERY request, not
  // just at login, or an admin/manager who already held a session before 2FA
  // shipped would keep using the app indefinitely without ever enrolling.
  //
  // The 2FA and session endpoints are exempt, or enrolling would be
  // impossible: the user needs to reach `/2fa/enrol/*` to escape this gate,
  // and `/auth/me` + `/auth/logout` so the frontend can render the blocking
  // screen and let them sign out.
  if (isTwoFactorMandatory(user.role) && !user.twoFactorEnabled && !isEnrolmentExemptPath(req.path)) {
    throw new ApiError(
      403,
      "Two-factor authentication is required for your role. Please complete enrolment.",
      [{ code: "TWO_FACTOR_ENROLMENT_REQUIRED" }]
    );
  }

  req.user = user;
  next();
});

const ENROLMENT_EXEMPT_PATHS = ["/2fa/enrol/start", "/2fa/enrol/confirm", "/me", "/logout"];

function isEnrolmentExemptPath(path) {
  return ENROLMENT_EXEMPT_PATHS.some((exempt) => path.endsWith(exempt));
}

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
    throw new ApiError(401, "Two-factor session missing. Please sign in again.");
  }

  let decodedToken;

  try {
    decodedToken = jwt.verify(token, env.jwtSecret);
  } catch (error) {
    throw new ApiError(401, "Your sign-in attempt expired. Please sign in again.");
  }

  if (decodedToken.scope !== "pre_auth") {
    throw new ApiError(401, "Invalid two-factor session.");
  }

  const user = await User.findById(decodedToken.userId);

  if (!user || !user.isActive) {
    throw new ApiError(401, "User no longer exists.");
  }

  req.preAuthUser = user;
  next();
});
