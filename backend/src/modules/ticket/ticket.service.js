import ApiError from "../../utils/ApiError.js";
import { can } from "../../helpers/permission.helper.js";
import { uploadTicketAttachment, signedComplaintPhotoUrl } from "../../services/cloudinary.service.js";
import { createNotification } from "../notification/notification.service.js";
import Ticket from "./ticket.model.js";
import Customer from "../customer/customer.model.js";
import User from "../user/user.model.js";
import Contact from "../customer/contact.model.js";
import { kickComplaintChecks } from "./ticketEscalation.service.js";

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

  kickComplaintChecks();

  const tickets = await Ticket.find(buildScopeFilter(resolvedScope, requestingUser)).sort({ createdAt: -1 }).lean();
  return withNames(tickets);
}

/**
 * Adds `customerName` and `assigneeName` beside the existing ids (2026-10-22,
 * for the Complaints screens) — two batched lookups, not one per row. Purely
 * additive: every field the list returned before is still there, unchanged.
 */
async function withNames(tickets) {
  const customerIds = [...new Set(tickets.map((ticket) => ticket.customerId).filter(Boolean).map(String))];
  const userIds = [...new Set(tickets.map((ticket) => ticket.assignedToId).filter(Boolean).map(String))];

  const [customers, users] = await Promise.all([
    Customer.find({ _id: { $in: customerIds } }).select("companyName").lean(),
    User.find({ _id: { $in: userIds } }).select("name").lean(),
  ]);
  const customerNames = new Map(customers.map((customer) => [String(customer._id), customer.companyName]));
  const userNames = new Map(users.map((user) => [String(user._id), user.name]));

  return tickets.map((ticket) => ({
    ...ticket,
    customerName: customerNames.get(String(ticket.customerId)) || null,
    assigneeName: ticket.assignedToId ? userNames.get(String(ticket.assignedToId)) || null : null,
  }));
}

/**
 * One ticket with everything the person handling it needs (2026-10-22): who
 * the customer is and whom to call, what they said, when they want a call,
 * their photos as short-lived signed links, and the timeline with names.
 * Same visibility as every other ticket action — 404 when out of scope.
 */
export async function getTicketDetail(ticketId, requestingUser) {
  const ticket = await getViewableTicketOrThrow(ticketId, requestingUser);

  const [customer, primaryContact, assignee] = await Promise.all([
    Customer.findById(ticket.customerId).select("companyName phone siteAddress"),
    Contact.findOne({ customerId: ticket.customerId, isPrimary: true }).sort({ createdAt: 1 }).select("name phone"),
    ticket.assignedToId ? User.findById(ticket.assignedToId).select("name") : null,
  ]);

  const authorIds = [...new Set(ticket.history.map((entry) => entry.authorId).filter(Boolean).map(String))];
  const authors = new Map(
    (await User.find({ _id: { $in: authorIds } }).select("name").lean()).map((user) => [String(user._id), user.name])
  );
  const firstCustomerEntry = ticket.history.find((entry) => entry.byCustomer);

  return {
    _id: ticket._id,
    number: ticket.number ?? null,
    subject: ticket.subject,
    category: ticket.category,
    status: ticket.status,
    source: ticket.source,
    callbackTime: ticket.callbackTime ?? null,
    // The person who raised it through the link, if they gave a name/number.
    raisedBy: ticket.contactName || ticket.contactPhone ? { name: ticket.contactName || null, phone: ticket.contactPhone || null } : null,
    description: firstCustomerEntry?.comment ?? ticket.history[0]?.comment ?? null,
    customer: {
      _id: customer?._id ?? ticket.customerId,
      companyName: customer?.companyName ?? null,
      phone: customer?.phone ?? null,
      siteAddress: customer?.siteAddress ?? null,
      primaryContact: primaryContact ? { name: primaryContact.name, phone: primaryContact.phone || null } : null,
    },
    assignedTo: assignee ? { _id: assignee._id, name: assignee.name } : null,
    photoUrls: ticket.customerPhotos.map((photo) => signedComplaintPhotoUrl(photo.publicId)),
    createdAt: ticket.createdAt,
    acknowledgedAt: ticket.acknowledgedAt ?? null,
    resolvedAt: ticket.resolvedAt ?? null,
    escalations: ticket.escalations.map(({ kind, level, at }) => ({ kind, level, at })),
    history: ticket.history.map((entry) => ({
      type: entry.type,
      by: entry.byCustomer ? "Customer" : authors.get(String(entry.authorId)) || "Staff",
      comment: entry.comment,
      fromStatus: entry.fromStatus,
      toStatus: entry.toStatus,
      createdAt: entry.createdAt,
    })),
  };
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
 *
 * Notification on assignment — a deliberate small addition beyond §7.8's
 * literal scope (that section never mentions push notifications), made
 * because the Notification module (§6.7/Phase 9) is generic infrastructure
 * and Ticket already has this exact assign action ready to hang it off of.
 * Not part of the Leads-specific push spec — see final-plan.md's Platform
 * section for this noted as an addition, not a silently expanded scope.
 * Skipped if an admin/manager assigns a ticket to themselves, same
 * "don't notify someone about what they just did" reasoning as Leads'
 * assignment notification.
 */
export async function assignTicket(ticketId, assignedToId, requestingUser) {
  const ticket = await Ticket.findById(ticketId);

  if (!ticket) {
    throw new ApiError(404, "Ticket not found");
  }

  await ensureUserExists(assignedToId, "assignedToId");

  ticket.assignedToId = assignedToId;
  await ticket.save();

  if (String(assignedToId) !== String(requestingUser._id)) {
    await createNotification(
      assignedToId,
      "ticket_assigned",
      `You've been assigned a ticket: ${ticket.subject}`,
      { module: "tickets", id: ticket._id }
    );
  }

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
  // Complaint timing (2026-10-22): the first move off "open" is the
  // acknowledgement; reaching resolved/closed is the resolution, cleared again
  // if the ticket is reopened. Escalation reads these.
  if (fromStatus === "open" && status !== "open" && !ticket.acknowledgedAt) {
    ticket.acknowledgedAt = new Date();
  }
  if (status === "resolved" || status === "closed") {
    ticket.resolvedAt = ticket.resolvedAt || new Date();
  } else {
    ticket.resolvedAt = null;
  }
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
