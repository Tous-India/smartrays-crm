import { Router } from "express";
import authenticate from "../../middlewares/authenticate.middleware.js";
import { authorize } from "../../middlewares/authorize.middleware.js";
import { create, list, update } from "./amc.controller.js";
import { validateCreateAMCInput, validateUpdateAMCInput } from "./amc.validation.js";

const amcRouter = Router();

// No separate "create" action — §5's matrix lists only "amc.view/edit" as one
// combined row, so creating/managing an AMC record is gated by `edit`, the
// same "manage" reasoning `customers.edit` already uses for its sub-resources.
amcRouter.get("/", authenticate, authorize("amc", "view"), list);
amcRouter.post("/", authenticate, authorize("amc", "edit"), validateCreateAMCInput, create);
amcRouter.patch("/:id", authenticate, authorize("amc", "edit"), validateUpdateAMCInput, update);

export default amcRouter;
