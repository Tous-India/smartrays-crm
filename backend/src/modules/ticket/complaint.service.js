import mongoose from "mongoose";
import ApiError from "../../utils/ApiError.js";
import { can } from "../../helpers/permission.helper.js";
import { uploadComplaintPhoto, signedComplaintPhotoUrl } from "../../services/cloudinary.service.js";
import { createNotification } from "../notification/notification.service.js";
import Customer from "../customer/customer.model.js";
import Contact from "../customer/contact.model.js";
import User from "../user/user.model.js";
import Ticket, { COMPLAINT_PRIORITIES } from "./ticket.model.js";
import { findComplaintAssigners, normalizeIndianMobile } from "./complaintPeople.js";
import { checkPhotos } from "./publicComplaint.service.js";
import { kickComplaintChecks } from "./ticketEscalation.service.js";

/**
 * Customer complaints, the staff side (2026-10-23).
 *
 * - Assigners — admin, or anyone granted `complaints.assign` — see every
 *   complaint (`complaints.view_all` alone also sees them, read-only) and
 *   assign each one to a staff member with a priority and a visit date.
 * - The technician (whoever it is assigned to — no permission needed) sees
 *   "My complaints", moves it Assigned → On the way → Working → Resolved,
 *   adds live photos and notes, or sends it back with a reason.
 * - Every change is in the history (who, what, when). The technician is told
 *   when assigned (with who assigned it); the assigners are told of every
 *   status change and send-back.
 *
 * Complaints are Tickets with source "complaint_link"; the older /tickets
 * endpoints no longer show them (ticket.service.js).
 */

const COMPLAINT = { source: "complaint_link" };
const WORK_STEPS = ["assigned", "on_the_way", "working", "resolved"];
const STATUS_LABELS = {
  open: "Received",
  assigned: "Assigned",
  on_the_way: "On the way",
  working: "Working",
  resolved: "Resolved",
};
const PRIORITY_LABELS = { low: "Low", medium: "Medium", high: "High", urgent: "Urgent" };
const LIST_FILTERS = {
  unassigned: { status: "open" },
  assigned: { status: { $in: ["assigned", "on_the_way", "working"] } },
  resolved: { status: { $in: ["resolved", "closed"] } },
};
const SEND_BACK_REASON = { min: 5, max: 500 };
const NOTE_MAX = 1000;
const VISIT_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const canSeeAll = (user) => can(user, "complaints", "view_all") || can(user, "complaints", "assign");
const canAssign = (user) => can(user, "complaints", "assign");
const isAssignee = (ticket, user) => Boolean(ticket.assignedToId) && String(ticket.assignedToId) === String(user._id);

/** "2026-10-25" → "25 Oct" */
export function shortVisitDate(visitDate) {
  if (!visitDate || !VISIT_DATE_PATTERN.test(visitDate)) return null;
  const [, month, day] = visitDate.split("-").map(Number);
  return `${day} ${MONTHS[month - 1]}`;
}

function shortText(value, max) {
  if (!value) return "";
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function descriptionOf(ticket) {
  return ticket.history.find((entry) => entry.byCustomer)?.comment ?? ticket.history[0]?.comment ?? ticket.subject;
}

/** "Sharma ji, B-12, Sector 7, Dwarka" — who and where, for notifications. */
function whoAndWhere(ticket, customerName) {
  const who = customerName || ticket.contactName || `complaint ${ticket.number}`;
  return ticket.address ? `${who}, ${shortText(ticket.address, 60)}` : who;
}

async function notifyAssigners(ticket, type, message, exceptUserId) {
  const assigners = await findComplaintAssigners();
  for (const assigner of assigners) {
    if (String(assigner._id) === String(exceptUserId)) continue;
    await createNotification(assigner._id, type, message, { module: "complaints", id: ticket._id });
  }
}

async function findComplaintOr404(id) {
  if (!mongoose.isValidObjectId(id)) throw new ApiError(404, "Complaint not found");
  const ticket = await Ticket.findOne({ _id: id, ...COMPLAINT });
  if (!ticket) throw new ApiError(404, "Complaint not found");
  return ticket;
}

/** Viewable = sees all, or is the assignee. 404 otherwise (never confirm it exists). */
async function viewableComplaint(id, user) {
  const ticket = await findComplaintOr404(id);
  if (!canSeeAll(user) && !isAssignee(ticket, user)) throw new ApiError(404, "Complaint not found");
  return ticket;
}

/** Workable = the assignee, or an assigner. */
async function workableComplaint(id, user) {
  const ticket = await findComplaintOr404(id);
  if (!canAssign(user) && !isAssignee(ticket, user)) throw new ApiError(404, "Complaint not found");
  return ticket;
}

/**
 * GET /complaints?filter=unassigned|assigned|resolved — everything for
 * those who see all (unassigned first, then newest), otherwise "My
 * complaints": only what is assigned to the caller.
 */
export async function listComplaints({ filter } = {}, user) {
  kickComplaintChecks();

  const query = { ...COMPLAINT, ...(LIST_FILTERS[filter] || {}) };
  if (!canSeeAll(user)) query.assignedToId = user._id;

  const tickets = await Ticket.find(query).sort({ createdAt: -1 }).lean();
  const customerIds = [...new Set(tickets.map((t) => t.customerId).filter(Boolean).map(String))];
  const userIds = [...new Set(tickets.map((t) => t.assignedToId).filter(Boolean).map(String))];
  const [customers, users] = await Promise.all([
    Customer.find({ _id: { $in: customerIds } }).select("companyName").lean(),
    User.find({ _id: { $in: userIds } }).select("name").lean(),
  ]);
  const customerNames = new Map(customers.map((c) => [String(c._id), c.companyName]));
  const userNames = new Map(users.map((u) => [String(u._id), u.name]));

  const rows = tickets.map((ticket) => ({
    _id: ticket._id,
    number: ticket.number,
    status: ticket.status,
    priority: ticket.priority ?? null,
    contactName: ticket.contactName ?? null,
    contactPhone: ticket.contactPhone ?? null,
    customerName: ticket.customerId ? customerNames.get(String(ticket.customerId)) ?? null : null,
    companyName: ticket.companyName ?? null,
    description: descriptionOf(ticket),
    address: ticket.address ?? null,
    assigneeName: ticket.assignedToId ? userNames.get(String(ticket.assignedToId)) ?? null : null,
    visitDate: ticket.visitDate ?? null,
    callbackTime: ticket.callbackTime ?? null,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
  }));

  // Unassigned ones on top, newest first within each group (the sort is stable).
  return rows.sort((a, b) => Number(b.status === "open") - Number(a.status === "open"));
}

/** GET /complaints/assignees — every active staff member (not customers). */
export async function listAssignees() {
  return User.find({ isActive: true, role: { $ne: "customer" } }).select("_id name role").sort({ name: 1 }).lean();
}

/** GET /complaints/:id */
export async function getComplaintDetail(id, user) {
  const ticket = await viewableComplaint(id, user);

  const peopleIds = new Set(
    [
      ticket.assignedToId,
      ticket.assignedById,
      ...ticket.history.map((entry) => entry.authorId),
      ...ticket.staffPhotos.map((photo) => photo.uploadedBy),
    ]
      .filter(Boolean)
      .map(String)
  );
  const [customer, people] = await Promise.all([
    ticket.customerId ? Customer.findById(ticket.customerId).select("companyName phone siteAddress commissioningDate").lean() : null,
    User.find({ _id: { $in: [...peopleIds] } }).select("name").lean(),
  ]);
  const names = new Map(people.map((person) => [String(person._id), person.name]));
  const isAssigner = canAssign(user);
  const [suggestedCustomers, canSaveContact] = await Promise.all([
    isAssigner && !customer ? similarCustomers(ticket.companyName || ticket.contactName) : [],
    isAssigner && customer ? numberIsNew(customer, ticket.contactPhone) : false,
  ]);
  const person = (personId) => (personId ? { _id: personId, name: names.get(String(personId)) ?? "Staff" } : null);

  return {
    _id: ticket._id,
    number: ticket.number,
    status: ticket.status,
    priority: ticket.priority ?? null,
    visitDate: ticket.visitDate ?? null,
    contactName: ticket.contactName ?? null,
    contactPhone: ticket.contactPhone ?? null,
    companyName: ticket.companyName ?? null,
    address: ticket.address ?? null,
    location: ticket.location?.lat !== undefined ? ticket.location : null,
    description: descriptionOf(ticket),
    callbackTime: ticket.callbackTime ?? null,
    matchedCustomer: customer
      ? {
          _id: customer._id,
          companyName: customer.companyName,
          phone: customer.phone ?? null,
          siteAddress: customer.siteAddress ?? null,
          commissioningDate: customer.commissioningDate ?? null,
        }
      : null,
    assignedTo: person(ticket.assignedToId),
    assignedBy: person(ticket.assignedById),
    assignedAt: ticket.assignedAt ?? null,
    customerPhotos: ticket.customerPhotos.map((photo) => ({ url: signedComplaintPhotoUrl(photo.publicId), at: photo.uploadedAt })),
    staffPhotos: ticket.staffPhotos.map((photo) => ({
      url: signedComplaintPhotoUrl(photo.publicId),
      by: names.get(String(photo.uploadedBy)) ?? "Staff",
      at: photo.uploadedAt,
    })),
    history: ticket.history.map((entry) => ({
      type: entry.type,
      by: entry.byCustomer ? "Customer" : names.get(String(entry.authorId)) ?? "Staff",
      comment: entry.comment ?? null,
      fromStatus: entry.fromStatus ?? null,
      toStatus: entry.toStatus ?? null,
      createdAt: entry.createdAt,
    })),
    createdAt: ticket.createdAt,
    resolvedAt: ticket.resolvedAt ?? null,
    canAssign: isAssigner,
    canWork: isAssignee(ticket, user) || isAssigner,
    // Unknown caller (2026-10-23): customers whose name looks like what they
    // typed — "Did you mean …?" — and, once linked, whether their number can
    // be saved as that customer's contact.
    suggestedCustomers,
    canSaveContact,
  };
}

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Customers whose name shares a word with the typed one — each word of 3+
 * letters compared on its first 5 letters, so "Gupta Industry" finds "Gupta
 * Industries". Most shared words first; at most 5.
 */
async function similarCustomers(typedName) {
  const stems = [...new Set(String(typedName || "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3).map((w) => w.slice(0, 5)))];
  if (stems.length === 0) return [];
  const patterns = stems.map((stem) => new RegExp(`(^|[^a-z0-9])${escapeRegex(stem)}`, "i"));
  const found = await Customer.find({ $or: patterns.map((pattern) => ({ companyName: pattern })) }).select("_id companyName").limit(25).lean();
  const score = (name) => patterns.filter((pattern) => pattern.test(name)).length;
  return found
    .sort((a, b) => score(b.companyName) - score(a.companyName) || a.companyName.localeCompare(b.companyName))
    .slice(0, 5)
    .map(({ _id, companyName }) => ({ _id, companyName }));
}

/** True when this phone is not yet the customer's own or any of its contacts'. */
async function numberIsNew(customer, phone) {
  const mobile = normalizeIndianMobile(phone);
  if (!mobile) return false;
  const contacts = await Contact.find({ customerId: customer._id }).select("phone").lean();
  return ![customer.phone, ...contacts.map((c) => c.phone)].some((known) => normalizeIndianMobile(known) === mobile);
}

/** GET /complaints/customer-options?search= — assigners finding the right customer. */
export async function listCustomerOptions({ search } = {}, user) {
  if (!canAssign(user)) throw new ApiError(403, "You do not have permission to link complaints to customers");
  const text = typeof search === "string" ? search.trim() : "";
  if (text.length < 2) return [];
  return Customer.find({ companyName: new RegExp(escapeRegex(text), "i") }).select("_id companyName").sort({ companyName: 1 }).limit(10).lean();
}

/** PATCH /complaints/:id/customer { customerId } — this unknown caller is that customer. */
export async function linkComplaintCustomer(id, { customerId } = {}, user) {
  if (!canAssign(user)) throw new ApiError(403, "You do not have permission to link complaints to customers");
  const ticket = await findComplaintOr404(id);
  if (!mongoose.isValidObjectId(customerId)) throw new ApiError(400, "Please choose a customer.");
  const customer = await Customer.findById(customerId).select("companyName");
  if (!customer) throw new ApiError(400, "Please choose a customer.");

  ticket.customerId = customer._id;
  ticket.history.push({ type: "linked", authorId: user._id, comment: `Linked to customer ${customer.companyName}` });
  await ticket.save();
  return getComplaintDetail(ticket._id, user);
}

/** POST /complaints/:id/save-contact — the caller's name and number become a contact of the linked customer. */
export async function saveComplaintContact(id, user) {
  if (!canAssign(user)) throw new ApiError(403, "You do not have permission to save contacts");
  const ticket = await findComplaintOr404(id);
  if (!ticket.customerId) throw new ApiError(400, "Link the complaint to a customer first.");
  const customer = await Customer.findById(ticket.customerId).select("companyName phone");
  if (!(await numberIsNew(customer, ticket.contactPhone))) throw new ApiError(400, "This number is already saved for the customer.");

  await Contact.create({ customerId: customer._id, name: ticket.contactName || "Contact", phone: ticket.contactPhone });
  ticket.history.push({ type: "contact_saved", authorId: user._id, comment: `Saved ${ticket.contactPhone} as a contact of ${customer.companyName}` });
  await ticket.save();
  return getComplaintDetail(ticket._id, user);
}

async function validAssignee(assignedToId) {
  if (!mongoose.isValidObjectId(assignedToId)) throw new ApiError(400, "Please choose who should handle it.");
  const assignee = await User.findOne({ _id: assignedToId, isActive: true, role: { $ne: "customer" } }).select("_id name");
  if (!assignee) throw new ApiError(400, "Please choose an active staff member.");
  return assignee;
}

/** PATCH /complaints/:id/assign { assignedToId, priority, visitDate } — complaints.assign. */
export async function assignComplaint(id, { assignedToId, priority, visitDate } = {}, user) {
  if (!canAssign(user)) throw new ApiError(403, "You do not have permission to assign complaints");
  const ticket = await findComplaintOr404(id);

  if (!COMPLAINT_PRIORITIES.includes(priority)) throw new ApiError(400, "Please choose a priority: Low, Medium, High or Urgent.");
  if (typeof visitDate !== "string" || !VISIT_DATE_PATTERN.test(visitDate) || Number.isNaN(Date.parse(visitDate))) {
    throw new ApiError(400, "Please choose a visit date.");
  }
  const assignee = await validAssignee(assignedToId);

  const previousAssigneeId = ticket.assignedToId;
  const fromStatus = ticket.status;
  ticket.assignedToId = assignee._id;
  ticket.assignedById = user._id;
  ticket.assignedAt = new Date();
  ticket.priority = priority;
  ticket.visitDate = visitDate;
  ticket.status = "assigned";
  ticket.resolvedAt = null;
  ticket.history.push({
    type: "assigned",
    authorId: user._id,
    fromStatus,
    toStatus: "assigned",
    comment: `Assigned to ${assignee.name} — ${PRIORITY_LABELS[priority]} priority, visit ${shortVisitDate(visitDate)}`,
  });
  await ticket.save();

  const customer = ticket.customerId ? await Customer.findById(ticket.customerId).select("companyName").lean() : null;
  if (String(assignee._id) !== String(user._id)) {
    await createNotification(
      assignee._id,
      "complaint_assigned",
      `${user.name} assigned you a complaint — ${PRIORITY_LABELS[priority]} priority, visit ${shortVisitDate(visitDate)} — ${whoAndWhere(ticket, customer?.companyName)}`,
      { module: "complaints", id: ticket._id }
    );
  }
  if (previousAssigneeId && String(previousAssigneeId) !== String(assignee._id) && String(previousAssigneeId) !== String(user._id)) {
    await createNotification(
      previousAssigneeId,
      "complaint_status",
      `Complaint ${ticket.number} was reassigned to ${assignee.name}. You no longer need to visit.`,
      { module: "complaints", id: ticket._id }
    );
  }

  return getComplaintDetail(ticket._id, user);
}

/** PATCH /complaints/:id/status { status, note? } — the assignee (or an assigner); forward only. */
export async function changeComplaintStatus(id, { status, note } = {}, user) {
  const ticket = await workableComplaint(id, user);

  const from = WORK_STEPS.indexOf(ticket.status);
  const to = WORK_STEPS.indexOf(status);
  if (to < 1) throw new ApiError(400, "Please choose: On the way, Working or Resolved.");
  if (from < 0) throw new ApiError(400, "Assign this complaint first.");
  if (to <= from) throw new ApiError(400, `This complaint is already ${STATUS_LABELS[ticket.status]}.`);
  const text = typeof note === "string" ? note.trim() : "";
  if (text.length > NOTE_MAX) throw new ApiError(400, `Please keep the note under ${NOTE_MAX} characters.`);

  const fromStatus = ticket.status;
  ticket.status = status;
  if (status === "resolved") ticket.resolvedAt = new Date();
  ticket.history.push({ type: "status_change", authorId: user._id, fromStatus, toStatus: status, comment: text || null });
  await ticket.save();

  const message = `${user.name}: complaint ${ticket.number} is now ${STATUS_LABELS[status]}${text ? ` — ${shortText(text, 80)}` : ""}`;
  await notifyAssigners(ticket, "complaint_status", message, user._id);

  return getComplaintDetail(ticket._id, user);
}

/** POST /complaints/:id/photos (multipart "photo") — the assignee (or an assigner). */
export async function addComplaintPhoto(id, file, user) {
  const ticket = await workableComplaint(id, user);
  if (!file) throw new ApiError(400, "Please take a photo.");
  const [photo] = checkPhotos([file]);

  const { publicId } = await uploadComplaintPhoto(photo.buffer, photo.type);
  ticket.staffPhotos.push({ publicId, uploadedBy: user._id });
  ticket.history.push({ type: "photo", authorId: user._id, comment: "Added a photo" });
  await ticket.save();

  return getComplaintDetail(ticket._id, user);
}

/** POST /complaints/:id/send-back { reason } — the assignee hands it back, unassigned. */
export async function sendComplaintBack(id, { reason } = {}, user) {
  const ticket = await findComplaintOr404(id);
  if (!isAssignee(ticket, user)) throw new ApiError(404, "Complaint not found");
  if (ticket.status === "resolved" || ticket.status === "closed") {
    throw new ApiError(400, "This complaint is already resolved.");
  }
  const text = typeof reason === "string" ? reason.trim() : "";
  if (text.length < SEND_BACK_REASON.min) throw new ApiError(400, "Please say why you are sending it back.");
  if (text.length > SEND_BACK_REASON.max) {
    throw new ApiError(400, `Please keep the reason under ${SEND_BACK_REASON.max} characters.`);
  }

  const fromStatus = ticket.status;
  ticket.status = "open";
  ticket.assignedToId = null;
  ticket.unassignedSince = new Date();
  ticket.history.push({ type: "sent_back", authorId: user._id, fromStatus, toStatus: "open", comment: text });
  await ticket.save();

  await notifyAssigners(ticket, "complaint_sent_back", `${user.name} sent back complaint ${ticket.number}: ${shortText(text, 120)}`, user._id);

  return { _id: ticket._id, number: ticket.number, status: ticket.status };
}
