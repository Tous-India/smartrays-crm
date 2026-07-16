import { Router } from "express";
import multer from "multer";
import authenticate from "../../middlewares/authenticate.middleware.js";
import { authorize } from "../../middlewares/authorize.middleware.js";
import {
  create,
  list,
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

leadRouter.get("/", authenticate, authorize("leads", "view"), list);
leadRouter.post("/", authenticate, authorize("leads", "create"), validateCreateLeadInput, create);

// "/export" and "/import" are registered before "/:id" so Express never
// matches "export"/"import" as a lead id.
leadRouter.get("/export", authenticate, authorize("leads", "view"), exportLeads);
leadRouter.post(
  "/import",
  authenticate,
  authorize("leads", "create"),
  upload.single("file"),
  importLeads
);

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
