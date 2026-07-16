import { Router } from "express";
import { register, login, logout, getCurrentUser, customerSignup } from "./auth.controller.js";
import { validateRegisterInput, validateLoginInput, validateCustomerSignupInput } from "./auth.validation.js";
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

export default authRouter;
