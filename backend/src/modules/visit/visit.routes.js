import { Router } from "express";
import multer from "multer";
import authenticate from "../../middlewares/authenticate.middleware.js";
import { authorize } from "../../middlewares/authorize.middleware.js";
import ApiError from "../../utils/ApiError.js";
import { create, list, getOne, arrive, addPhoto, complete, customerOptions } from "./visit.controller.js";

/**
 * Verified site visits (2026-10-22) — /api/v1/visits. No permission keys of
 * their own: a visit IS a Service, so assigning one needs services.create
 * (admin and managers by template) and everything else services.view; the
 * service then applies the Services scope and "only the assignee" rules.
 */
const visitRouter = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1 } }).single("photo");
function receivePhoto(req, res, next) {
  upload(req, res, (error) => {
    if (!error) return next();
    if (error.code === "LIMIT_FILE_SIZE") return next(new ApiError(400, "That photo is too large."));
    return next(new ApiError(400, "The photo could not be read. Please take it again."));
  });
}

visitRouter.post("/", authenticate, authorize("services", "create"), create);
visitRouter.get("/", authenticate, authorize("services", "view"), list);
// Before "/:id", so the path is never read as a visit id.
visitRouter.get("/customer-options", authenticate, authorize("services", "create"), customerOptions);
visitRouter.get("/:id", authenticate, authorize("services", "view"), getOne);
visitRouter.post("/:id/arrive", authenticate, authorize("services", "view"), arrive);
visitRouter.post("/:id/photos", authenticate, authorize("services", "view"), receivePhoto, addPhoto);
visitRouter.post("/:id/complete", authenticate, authorize("services", "view"), complete);

export default visitRouter;
