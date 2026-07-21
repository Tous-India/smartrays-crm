import { Router } from "express";
import {
  register,
  login,
  logout,
  getCurrentUser,
  customerSignup,
  forgotPassword,
  resetPasswordWithToken,
} from "./auth.controller.js";
import {
  validateRegisterInput,
  validateLoginInput,
  validateCustomerSignupInput,
  validateForgotPasswordInput,
  validateResetPasswordInput,
} from "./auth.validation.js";
import authenticate from "../../middlewares/authenticate.middleware.js";
import { requireAdmin } from "../../middlewares/authorize.middleware.js";

const authRouter = Router();

// Internal tool — no public self-registration for staff roles. Only a
// logged-in admin can create admin/manager/sales_associate/employee
// accounts. The very first admin is created by the seed:admin script (see
// backend/README.md), not through this endpoint.
authRouter.post("/register", authenticate, requireAdmin, validateRegisterInput, register);

// Customer Portal self-signup (§7.8) — deliberately separate from the
// admin-gated /register above, not overloaded onto it: public (no
// authenticate/requireAdmin), and the real gate is the email-domain match
// inside createCustomerSelfSignupUser, not an admin grant.
authRouter.post("/customer/signup", validateCustomerSignupInput, customerSignup);

authRouter.post("/login", validateLoginInput, login);
authRouter.post("/logout", authenticate, logout);
authRouter.get("/me", authenticate, getCurrentUser);

// Self-service password reset (§7.17) — both public, no authenticate: a
// user who forgot their password is by definition not logged in, and the
// reset token itself (not a session) is what authorizes /reset-password.
authRouter.post("/forgot-password", validateForgotPasswordInput, forgotPassword);
authRouter.post("/reset-password", validateResetPasswordInput, resetPasswordWithToken);

export default authRouter;
