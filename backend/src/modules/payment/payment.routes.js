import { Router } from "express";
import authenticate from "../../middlewares/authenticate.middleware.js";
import { authorize } from "../../middlewares/authorize.middleware.js";
import { create, list, update, remove, getAuditLog } from "./payment.controller.js";
import {
  validateCreatePaymentInput,
  validateUpdatePaymentInput,
  validateDeletePaymentInput,
} from "./payment.validation.js";

const paymentRouter = Router();

// Admin-only tab (§7.9/§5) — no ownership scoping exists for this module at
// all, unlike every other feature module; a plain authorize() gate is
// sufficient since there's nothing further to resolve in the service.
paymentRouter.get("/", authenticate, authorize("payments", "view"), list);
paymentRouter.post("/", authenticate, authorize("payments", "create"), validateCreatePaymentInput, create);

// Edit/delete audit trail (§7.9 extension, 2026-07-30) — same admin-only
// gate as everything else on this router, split into their own `edit`/
// `delete` PERMISSION_REGISTRY actions rather than reusing `create`, even
// though every role's grant today is identical (admin: all four, everyone
// else: none) — matches how `leads`/`customers` keep edit/delete distinct
// from create despite similar overlap, in case a future template ever wants
// to grant one without the others.
paymentRouter.patch("/:id", authenticate, authorize("payments", "edit"), validateUpdatePaymentInput, update);
paymentRouter.delete("/:id", authenticate, authorize("payments", "delete"), validateDeletePaymentInput, remove);
paymentRouter.get("/:id/audit-log", authenticate, authorize("payments", "view"), getAuditLog);

export default paymentRouter;
