import { Router } from "express";
import authenticate from "../../middlewares/authenticate.middleware.js";
import { authorize } from "../../middlewares/authorize.middleware.js";
import { create, list } from "./payment.controller.js";
import { validateCreatePaymentInput } from "./payment.validation.js";

const paymentRouter = Router();

// Admin-only tab (§7.9/§5) — no ownership scoping exists for this module at
// all, unlike every other feature module; a plain authorize() gate is
// sufficient since there's nothing further to resolve in the service.
paymentRouter.get("/", authenticate, authorize("payments", "view"), list);
paymentRouter.post("/", authenticate, authorize("payments", "create"), validateCreatePaymentInput, create);

export default paymentRouter;
