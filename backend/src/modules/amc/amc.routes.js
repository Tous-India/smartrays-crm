import { Router } from "express";
import authenticate from "../../middlewares/authenticate.middleware.js";
import { authorize } from "../../middlewares/authorize.middleware.js";
import { create, list, update, renew } from "./amc.controller.js";
import { validateCreateAMCInput, validateUpdateAMCInput, validateRenewAMCInput } from "./amc.validation.js";

const amcRouter = Router();

// No separate "create" action — §5's matrix lists only "amc.view/edit" as one
// combined row, so creating/managing an AMC record is gated by `edit`, the
// same "manage" reasoning `customers.edit` already uses for its sub-resources.
amcRouter.get("/", authenticate, authorize("amc", "view"), list);
amcRouter.post("/", authenticate, authorize("amc", "edit"), validateCreateAMCInput, create);
amcRouter.patch("/:id", authenticate, authorize("amc", "edit"), validateUpdateAMCInput, update);

// Renew (2026-08-05) — same `amc.edit` gate as PATCH above, deliberately not
// a new permission key: renewing is a management action on an AMC record,
// exactly like editing one. Creates a NEW record and expires the old, so it
// responds 201 (a resource was created), not 200.
amcRouter.post("/:id/renew", authenticate, authorize("amc", "edit"), validateRenewAMCInput, renew);

export default amcRouter;
