import { Router } from "express";
import multer from "multer";
import authenticate from "../../middlewares/authenticate.middleware.js";
import { authorize } from "../../middlewares/authorize.middleware.js";
import { env } from "../../config/env.js";
import ApiError from "../../utils/ApiError.js";
import {
  create,
  list,
  count,
  getOne,
  update,
  remove,
  changeStatus,
  toggleHot,
  logCall,
  getCallHistory,
  convert,
  importLeads,
  exportLeads,
  getSources,
  createFromWebsiteIntake,
} from "./lead.controller.js";
import {
  validateCreateLeadInput,
  validateUpdateLeadInput,
  validateStatusChangeInput,
  validateLogCallInput,
  validateConvertLeadInput,
} from "./lead.validation.js";

const upload = multer({ storage: multer.memoryStorage() });

const leadRouter = Router();

/**
 * Guards `POST /leads/website-intake` (§7.25) — the one deliberately public,
 * unauthenticated route on this router, so it does NOT use `authenticate`.
 * A shared secret sent as `X-Webhook-Token` is the only gate. Fails closed
 * on both sides: if `WEBSITE_LEAD_INTAKE_TOKEN` isn't configured at all, the
 * route refuses every request (503) rather than silently accepting
 * unauthenticated writes with no way to lock them down; a present-but-wrong
 * token is a 401, same as a missing one — never distinguished, so a caller
 * can't use the response to learn whether a token was even configured.
 */
function verifyWebsiteIntakeToken(req, res, next) {
  if (!env.websiteLeadIntakeToken) {
    throw new ApiError(503, "Website lead intake is not configured");
  }

  const providedToken = req.headers["x-webhook-token"];
  if (!providedToken || providedToken !== env.websiteLeadIntakeToken) {
    throw new ApiError(401, "Invalid or missing webhook token");
  }

  next();
}

leadRouter.get("/", authenticate, authorize("leads", "view"), list);
leadRouter.post("/", authenticate, authorize("leads", "create"), validateCreateLeadInput, create);

// "/count", "/export" and "/import" are registered before "/:id" so Express
// never matches any of them as a lead id.
leadRouter.get("/count", authenticate, authorize("leads", "view"), count);
leadRouter.get("/export", authenticate, authorize("leads", "view"), exportLeads);
leadRouter.post(
  "/import",
  authenticate,
  authorize("leads", "create"),
  upload.single("file"),
  importLeads
);

// Public WordPress/Forminator webhook (§7.25) — registered before "/:id" for
// the same reason as "/export"/"/import" above, though it's moot for POST
// today since no "POST /:id" route exists to collide with.
leadRouter.post("/website-intake", verifyWebsiteIntakeToken, createFromWebsiteIntake);

leadRouter.get("/:id", authenticate, authorize("leads", "view"), getOne);
leadRouter.patch("/:id", authenticate, authorize("leads", "edit"), validateUpdateLeadInput, update);
leadRouter.delete("/:id", authenticate, authorize("leads", "delete"), remove);

leadRouter.patch(
  "/:id/status",
  authenticate,
  authorize("leads", "edit"),
  validateStatusChangeInput,
  changeStatus
);
leadRouter.patch("/:id/hot", authenticate, authorize("leads", "edit"), toggleHot);

leadRouter.post(
  "/:id/calls",
  authenticate,
  authorize("leads", "edit"),
  validateLogCallInput,
  logCall
);
leadRouter.get("/:id/calls", authenticate, authorize("leads", "view"), getCallHistory);

leadRouter.post(
  "/:id/convert",
  authenticate,
  authorize("leads", "edit"),
  validateConvertLeadInput,
  convert
);

export default leadRouter;

// Lead sources are a low-sensitivity shared config list (just dropdown labels
// like "Website", "Referral"), so any authenticated user can read them —
// there's no dedicated write endpoint yet, only the lazy first-fetch seed in
// lead.service.js#listLeadSources.
const leadSourceRouter = Router();

leadSourceRouter.get("/", authenticate, getSources);

export { leadSourceRouter };
