import { Router } from "express";
import multer from "multer";
import ApiError from "../../utils/ApiError.js";
import authenticate from "../../middlewares/authenticate.middleware.js";
import { authorize } from "../../middlewares/authorize.middleware.js";
import { list, assignees, detail, assign, changeStatus, addPhoto, sendBack, customerOptions, linkCustomer, saveContact } from "./complaint.controller.js";
import { PHOTO_LIMITS } from "./publicComplaint.service.js";

/**
 * Customer complaints, staff side (2026-10-23) — mounted at /api/v1/complaints.
 * Who may do what is checked in complaint.service.js: assigners
 * (complaints.assign) for the full list and assigning, the assignee for
 * working it. Only the staff picker is gated here.
 */
const complaintRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: PHOTO_LIMITS.maxBytes, files: 1 },
}).single("photo");

function receivePhoto(req, res, next) {
  upload(req, res, (error) => {
    if (!error) return next();
    if (error.code === "LIMIT_FILE_SIZE") return next(new ApiError(400, "Each photo must be smaller than 5 MB."));
    return next(new ApiError(400, "The photo could not be read. Please try again."));
  });
}

complaintRouter.get("/", authenticate, list);
// Registered before "/:id" so the path is never read as a complaint id.
complaintRouter.get("/assignees", authenticate, authorize("complaints", "assign"), assignees);
complaintRouter.get("/customer-options", authenticate, customerOptions);
complaintRouter.get("/:id", authenticate, detail);
complaintRouter.patch("/:id/assign", authenticate, assign);
complaintRouter.patch("/:id/status", authenticate, changeStatus);
complaintRouter.post("/:id/photos", authenticate, receivePhoto, addPhoto);
complaintRouter.post("/:id/send-back", authenticate, sendBack);
// Unknown caller (2026-10-23): link to a customer, then save their number.
complaintRouter.patch("/:id/customer", authenticate, linkCustomer);
complaintRouter.post("/:id/save-contact", authenticate, saveContact);

export default complaintRouter;
