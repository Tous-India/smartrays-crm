import jwt from "jsonwebtoken";
import ApiError from "../utils/ApiError.js";
import asyncWrapper from "../utils/asyncWrapper.js";
import { env } from "../config/env.js";
import User from "../modules/user/user.model.js";

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

  const user = await User.findById(decodedToken.userId);

  if (!user) {
    throw new ApiError(401, "User no longer exists.");
  }

  if (!user.isActive) {
    throw new ApiError(403, "This account has been deactivated.");
  }

  req.user = user;
  next();
});

export default authenticate;
