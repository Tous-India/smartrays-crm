import ApiError from "../../utils/ApiError.js";
import { can } from "../../helpers/permission.helper.js";
import { uploadTicketAttachment } from "../../services/cloudinary.service.js";
import Ticket from "./ticket.model.js";
import Customer from "../customer/customer.model.js";
import User from "../user/user.model.js";

/**
 * Raise a ticket — internal (admin/manager, on a client's behalf after a
 * support call, per smartrays.md) or Customer Portal (self-service, always
 * scoped to the caller's own company). Both paths need `tickets.create`
 * (checked at the route, ticket.routes.js) — admin/manager and customer all
 * hold it by default, sales_associate/employee do not.
 */
export async function createTicket(payload, requestingUser) {
  const ticket =
    requestingUser.role === "customer"
      ? await buildPortalTicket(payload, requestingUser)
      : await buildInternalTicket(payload, requestingUser);

  ticket.history.push({
    type: "comment",
    authorId: requestingUser._id,
    comment: payload.description,
  });

  await ticket.save();

  return ticket;
}

/**
 * `customerId`/`raisedByCustomerId` are always derived from the requesting
 * user, never trusted from the payload — the same "self-service, don't trust
 * client-supplied ownership" pattern as Leads' `ownerId` forcing and
 * TravelLog's `employeeId` resolution. `category` is always forced to
 * `"other"` here regardless of anything the caller sends — portal users are
 * never asked to categorize (an admin/manager can recategorize later via
 * `PATCH /tickets/:id/status`... actually via a future recategorize action;
 * for now, category is set once at creation and not independently editable
 * — see the Known deviations note in final-plan.md §7.8).
 */
async function buildPortalTicket(payload, requestingUser) {
  return Ticket.create({
    subject: payload.subject,
    customerId: requestingUser.customerId,
    raisedByCustomerId: requestingUser._id,
    category: "other",
  });
}

/**
 * Internal raise (admin/manager). `customerId` must be supplied and must
 * reference a real `Customer` — there's no self-scoping to derive it from
 * the way there is for a portal user. `assignedToId` is an optional
 * convenience (create-and-assign in one step); `PATCH /tickets/:id/assign`
 * still exists for assigning/reassigning afterward.
 */
async function buildInternalTicket(payload, requestingUser) {
  const customer = await Customer.findById(payload.customerId);

  if (!customer) {
    throw new ApiError(400, "customerId does not match an existing customer");
  }

  if (payload.assignedToId) {
    await ensureUserExists(payload.assignedToId, "assignedToId");
  }

  return Ticket.create({
    subject: payload.subject,
    customerId: payload.customerId,
    raisedByCustomerId: null,
    category: payload.category || "other",
    assignedToId: payload.assignedToId || null,
  });
}

async function ensureUserExists(userId, fieldLabel) {
  const user = await User.findById(userId);

  if (!user) {
    throw new ApiError(400, `${fieldLabel} does not match an existing user`);
  }
}

const SCOPE_ACTIONS = { all: "view_all", assigned: "view_assigned", own: "view_own" };

/**
 * `scope=all` (admin/manager — everything, INCLUDING portal-raised tickets:
 * smartrays.md says internal visibility into those is Admin/PM only, and PM
 * is covered by `manager` per the employee/executive-merge decision, §11.1),
 * `scope=assigned` (employee — only tickets assigned to them), `scope=own`
 * (customer — only their own company's tickets, never another company's).
 * No default-to-"own" the way Leave/TravelLog/Payroll default their list
 * endpoints — Ticket has no universal "own" tier the way those modules do
 * (an admin/employee has no "own" tickets concept at all); instead, a
 * missing `scope` resolves to whichever tier the caller's role actually
 * holds, in priority order all > assigned > own.
 */
export async function listTickets(scope, requestingUser) {
  const resolvedScope = scope || resolveDefaultScope(requestingUser);
  const action = SCOPE_ACTIONS[resolvedScope];

  if (!action || !can(requestingUser, "tickets", action)) {
    throw new ApiError(403, "You do not have permission to view tickets in this scope");
  }

  return Ticket.find(buildScopeFilter(resolvedScope, requestingUser)).sort({ createdAt: -1 });
}

function resolveDefaultScope(requestingUser) {
  if (can(requestingUser, "tickets", "view_all")) {
    return "all";
  }

  if (can(requestingUser, "tickets", "view_assigned")) {
    return "assigned";
  }

  if (can(requestingUser, "tickets", "view_own")) {
    return "own";
  }

  return null;
}

function buildScopeFilter(scope, requestingUser) {
  if (scope === "assigned") {
    return { assignedToId: requestingUser._id };
  }

  if (scope === "own") {
    return { customerId: requestingUser.customerId };
  }

  return {};
}

/**
 * Admin/manager only (`tickets.assign`, checked at the route) — no
 * structural check needed on top of that, the same shape as
 * `PATCH /leave/:id/approve`'s plain `requireAdmin` gate.
 */
export async function assignTicket(ticketId, assignedToId, requestingUser) {
  const ticket = await Ticket.findById(ticketId);

  if (!ticket) {
    throw new ApiError(404, "Ticket not found");
  }

  await ensureUserExists(assignedToId, "assignedToId");

  ticket.assignedToId = assignedToId;
  await ticket.save();

  return ticket;
}

/**
 * Fetches a ticket only if the requesting user can view it at all — 404
 * (not 403) otherwise, matching the Leads/Location/User/Payroll precedent
 * for not confirming whether an out-of-scope record even exists.
 */
async function getViewableTicketOrThrow(ticketId, requestingUser) {
  const ticket = await Ticket.findById(ticketId);

  if (!ticket || !canViewTicket(ticket, requestingUser)) {
    throw new ApiError(404, "Ticket not found");
  }

  return ticket;
}

function canViewTicket(ticket, requestingUser) {
  if (can(requestingUser, "tickets", "view_all")) {
    return true;
  }

  if (can(requestingUser, "tickets", "view_assigned")) {
    return String(ticket.assignedToId) === String(requestingUser._id);
  }

  if (can(requestingUser, "tickets", "view_own")) {
    return String(ticket.customerId) === String(requestingUser.customerId);
  }

  return false;
}

/**
 * Narrower than "can view" — admin/manager (holding `tickets.assign`) or the
 * ticket's own assigned employee (smartrays.md: the assigned employee
 * "work[s] on it", implying they progress its status). A customer who can
 * view their own ticket cannot change its status — they get 403 here, not
 * 404, since they DO legitimately know it exists (canViewTicket already let
 * them through); this is "you can see this, but not do that", a different
 * signal from "not found at all".
 */
function canManageTicketStatus(ticket, requestingUser) {
  if (can(requestingUser, "tickets", "assign")) {
    return true;
  }

  return String(ticket.assignedToId) === String(requestingUser._id);
}

/**
 * §6.6/§7.8 are silent on which status transitions are allowed — this
 * allows ANY transition (including "backwards", e.g. closed → open, a ticket
 * legitimately needing reopening) and just logs it, a stated assumption
 * rather than an invented state machine the spec never asked for.
 */
export async function changeTicketStatus(ticketId, { status, comment }, requestingUser) {
  const ticket = await getViewableTicketOrThrow(ticketId, requestingUser);

  if (!canManageTicketStatus(ticket, requestingUser)) {
    throw new ApiError(403, "You do not have permission to change this ticket's status");
  }

  const fromStatus = ticket.status;
  ticket.status = status;
  ticket.history.push({
    type: "status_change",
    authorId: requestingUser._id,
    fromStatus,
    toStatus: status,
    comment: comment || null,
  });

  await ticket.save();

  return ticket;
}

/**
 * "Anyone with view access to a specific ticket can comment" (admin/manager
 * always; employee if assigned; customer if it's their own company's
 * ticket) — no narrower check than `canViewTicket` itself.
 */
export async function addTicketComment(ticketId, comment, requestingUser) {
  const ticket = await getViewableTicketOrThrow(ticketId, requestingUser);

  ticket.history.push({ type: "comment", authorId: requestingUser._id, comment });
  await ticket.save();

  return ticket;
}

/**
 * Same view-access gate as comments — attaching a file (a screenshot, a log)
 * is treated as part of the same "add information to this ticket" family of
 * actions, not a separately-restricted one; §7.8 doesn't say otherwise.
 * Reuses `src/services/cloudinary.service.js#uploadTicketAttachment` rather
 * than duplicating upload logic.
 */
export async function addTicketAttachment(ticketId, fileInput, requestingUser) {
  const ticket = await getViewableTicketOrThrow(ticketId, requestingUser);

  const url = await uploadTicketAttachment(fileInput);
  ticket.attachments.push({ url, uploadedBy: requestingUser._id });
  await ticket.save();

  return ticket;
}
