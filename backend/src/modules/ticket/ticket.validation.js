import ApiError from "../../utils/ApiError.js";
import { TICKET_CATEGORIES, TICKET_STATUSES } from "./ticket.model.js";

const TICKET_SCOPES = ["all", "assigned", "own"];

/**
 * Validates POST /tickets. `customerId` is only required for an internal
 * raise (admin/manager) — a portal customer's own customerId is always
 * derived from `req.user`, never from the body (see ticket.service.js).
 */
export function validateCreateTicketInput(req, res, next) {
  const { subject, description, category, customerId } = req.body;

  if (!subject || !subject.trim()) {
    throw new ApiError(400, "subject is required");
  }

  if (!description || !description.trim()) {
    throw new ApiError(400, "description is required");
  }

  if (category !== undefined && !TICKET_CATEGORIES.includes(category)) {
    throw new ApiError(400, `category must be one of: ${TICKET_CATEGORIES.join(", ")}`);
  }

  if (req.user.role !== "customer" && !customerId) {
    throw new ApiError(400, "customerId is required when raising a ticket internally");
  }

  next();
}

/**
 * Validates GET /tickets's ?scope= query param.
 */
export function validateListQuery(req, res, next) {
  const { scope } = req.query;

  if (scope && !TICKET_SCOPES.includes(scope)) {
    throw new ApiError(400, `scope must be one of: ${TICKET_SCOPES.join(", ")}`);
  }

  next();
}

export function validateAssignInput(req, res, next) {
  const { assignedToId } = req.body;

  if (!assignedToId) {
    throw new ApiError(400, "assignedToId is required");
  }

  next();
}

export function validateStatusInput(req, res, next) {
  const { status, comment } = req.body;

  if (!status || !TICKET_STATUSES.includes(status)) {
    throw new ApiError(400, `status must be one of: ${TICKET_STATUSES.join(", ")}`);
  }

  if (comment !== undefined && comment !== null && typeof comment !== "string") {
    throw new ApiError(400, "comment must be a string");
  }

  next();
}

export function validateCommentInput(req, res, next) {
  const { comment } = req.body;

  if (!comment || !comment.trim()) {
    throw new ApiError(400, "comment is required");
  }

  next();
}

/**
 * A file is required for POST /tickets/:id/attachments — same "either
 * transport" acceptance as Attendance's photo capture (multipart req.file,
 * or a base64 data URI string in req.body.attachment).
 */
export function validateAttachmentInput(req, res, next) {
  if (!req.file && !req.body.attachment) {
    throw new ApiError(400, "A file is required (multipart 'file' field, or base64 'attachment' in the body)");
  }

  next();
}
