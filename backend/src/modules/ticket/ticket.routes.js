import { Router } from "express";
import multer from "multer";
import authenticate from "../../middlewares/authenticate.middleware.js";
import { authorize } from "../../middlewares/authorize.middleware.js";
import { create, list, assign, changeStatus, addComment, addAttachment } from "./ticket.controller.js";
import {
  validateCreateTicketInput,
  validateListQuery,
  validateAssignInput,
  validateStatusInput,
  validateCommentInput,
  validateAttachmentInput,
} from "./ticket.validation.js";

const upload = multer({ storage: multer.memoryStorage() });

const ticketRouter = Router();

// Admin/manager (internal raise) or customer (portal self-raise) — both
// hold `tickets.create` by default; sales_associate/employee do not.
ticketRouter.post("/", authenticate, authorize("tickets", "create"), validateCreateTicketInput, create);

// Permission checked inside listTickets per the requested ?scope=, not at
// the route level — same reasoning as GET /leave and GET /travel-logs.
ticketRouter.get("/", authenticate, validateListQuery, list);

// Admin/manager only.
ticketRouter.patch("/:id/assign", authenticate, authorize("tickets", "assign"), validateAssignInput, assign);

// Permission checked inside changeTicketStatus (admin/manager, or the
// ticket's own assigned employee) — a structural check, not a single
// route-level permission tier, the same shape as TravelLog's approve/reject.
ticketRouter.patch("/:id/status", authenticate, validateStatusInput, changeStatus);

// Permission checked inside addTicketComment/addTicketAttachment ("anyone
// with view access to this specific ticket") — not expressible as a single
// route-level authorize() call.
ticketRouter.post("/:id/comments", authenticate, validateCommentInput, addComment);
ticketRouter.post(
  "/:id/attachments",
  authenticate,
  upload.single("file"),
  validateAttachmentInput,
  addAttachment
);

export default ticketRouter;
