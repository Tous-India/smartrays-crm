import asyncWrapper from "../../utils/asyncWrapper.js";
import ApiResponse from "../../utils/ApiResponse.js";
import {
  createTicket,
  listTickets,
  assignTicket,
  changeTicketStatus,
  addTicketComment,
  addTicketAttachment,
} from "./ticket.service.js";

export const create = asyncWrapper(async (req, res) => {
  const ticket = await createTicket(req.body, req.user);

  res.status(201).json(new ApiResponse(201, ticket, "Ticket raised successfully"));
});

export const list = asyncWrapper(async (req, res) => {
  const tickets = await listTickets(req.query.scope, req.user);

  res.status(200).json(new ApiResponse(200, tickets, "Tickets fetched successfully"));
});

export const assign = asyncWrapper(async (req, res) => {
  const ticket = await assignTicket(req.params.id, req.body.assignedToId, req.user);

  res.status(200).json(new ApiResponse(200, ticket, "Ticket assigned successfully"));
});

export const changeStatus = asyncWrapper(async (req, res) => {
  const ticket = await changeTicketStatus(req.params.id, req.body, req.user);

  res.status(200).json(new ApiResponse(200, ticket, "Ticket status updated successfully"));
});

export const addComment = asyncWrapper(async (req, res) => {
  const ticket = await addTicketComment(req.params.id, req.body.comment, req.user);

  res.status(201).json(new ApiResponse(201, ticket, "Comment added successfully"));
});

// A file can arrive as a multipart upload (req.file, via multer) or as a
// base64 data URI string in a JSON body (req.body.attachment) — same
// either-transport acceptance as Attendance's photo capture.
export const addAttachment = asyncWrapper(async (req, res) => {
  const fileInput = req.file ? req.file.buffer : req.body.attachment;
  const ticket = await addTicketAttachment(req.params.id, fileInput, req.user);

  res.status(201).json(new ApiResponse(201, ticket, "Attachment added successfully"));
});
