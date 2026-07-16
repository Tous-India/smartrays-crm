import asyncWrapper from "../../utils/asyncWrapper.js";
import ApiResponse from "../../utils/ApiResponse.js";
import { env } from "../../config/env.js";
import { createUser, createCustomerSelfSignupUser } from "../user/user.service.js";
import { loginUser, getAuthCookieOptions, getAuthCookieMaxAgeMs } from "./auth.service.js";

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

  const { user, token } = await loginUser({ email, password });

  res.cookie(env.cookieName, token, {
    ...getAuthCookieOptions(),
    maxAge: getAuthCookieMaxAgeMs(),
  });

  res.status(200).json(new ApiResponse(200, user, "Logged in successfully"));
});

export const logout = asyncWrapper(async (req, res) => {
  res.clearCookie(env.cookieName, getAuthCookieOptions());

  res.status(200).json(new ApiResponse(200, null, "Logged out successfully"));
});

export const getCurrentUser = asyncWrapper(async (req, res) => {
  res.status(200).json(new ApiResponse(200, req.user, "Current user fetched successfully"));
});
