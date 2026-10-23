import crypto from "node:crypto";
import ApiError from "../../utils/ApiError.js";
import { uploadComplaintPhoto } from "../../services/cloudinary.service.js";
import { createNotification } from "../notification/notification.service.js";
import { createLeadFromComplaintForm } from "../lead/lead.service.js";
import User from "../user/user.model.js";
import Ticket, { CALLBACK_TIMES } from "./ticket.model.js";
import { nextTicketNumber } from "./ticketCounter.model.js";
import { findComplaintAssigners, findCustomerByPhone, firstName, normalizeIndianMobile } from "./complaintPeople.js";
import { findCustomerByComplaintToken } from "./complaintLink.service.js";
import Contact from "../customer/contact.model.js";
import { kickComplaintChecks } from "./ticketEscalation.service.js";

/**
 * The public complaint form (2026-10-23) — ONE link for every customer, no
 * login. Replaces the per-customer links of 2026-10-22.
 *
 * - "Complaint / problem" → a complaint (a Ticket, source "complaint_link")
 *   with nobody assigned; every assigner is notified (complaintPeople.js).
 * - "New requirement" → a lead for sales (lead.service.js), not a complaint.
 *
 * Nothing returned carries an internal id. The customer gets the complaint
 * number and a status token: 32 random bytes (43 base64url characters),
 * stored only as a SHA-256 hash, the only key to the status page.
 */

export const INVALID_STATUS_LINK_MESSAGE = "This status link is not valid. Please check the link, or call us.";
// One message for every way a customer's own link can be wrong (unknown,
// malformed, customer inactive, link reset) — it must not reveal which.
export const INVALID_LINK_MESSAGE = "This link is not valid. Please ask Smartrays for a new link.";
const COMPANY_NAME_MAX = 120;
export const PHOTO_LIMITS = { maxCount: 3, maxBytes: 5 * 1024 * 1024 };
const REQUEST_KINDS = ["complaint", "requirement"];
const DESCRIPTION_LIMITS = { min: 5, max: 1000 };
const NAME_MAX = 80;
const ADDRESS_LIMITS = { min: 5, max: 300 };
// A phone number: digits with optional +, spaces, dashes or brackets, 7–15 digits.
const PHONE_PATTERN = /^\+?[\d\s()-]+$/;
const STATUS_TOKEN_BYTES = 32;
const STATUS_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

// What the customer sees: five plain steps, not the internal states.
export function publicStatus(status) {
  if (status === "assigned" || status === "on_the_way" || status === "working") return status;
  if (status === "resolved" || status === "closed") return "resolved";
  if (status === "in_progress") return "working";
  return "received";
}

export function hashStatusToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// Magic bytes, not the file name or the browser's claimed type.
export function detectImageType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

/** Content-checked photos, or a plain-words 400. Shared with the technician's uploads. */
export function checkPhotos(files) {
  if (files.length > PHOTO_LIMITS.maxCount) {
    throw new ApiError(400, `You can add up to ${PHOTO_LIMITS.maxCount} photos.`);
  }
  return files.map((file) => {
    if (file.size > PHOTO_LIMITS.maxBytes) {
      throw new ApiError(400, "Each photo must be smaller than 5 MB.");
    }
    const type = detectImageType(file.buffer);
    if (!type) {
      throw new ApiError(400, "Only photos (JPG, PNG or WebP) can be added.");
    }
    return { buffer: file.buffer, type };
  });
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseLocation(body) {
  if (body.lat === undefined && body.lng === undefined) return null;
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new ApiError(400, "Your location could not be read. Please type your address instead.");
  }
  const accuracy = Number(body.locationAccuracy);
  return { lat, lng, ...(Number.isFinite(accuracy) && accuracy >= 0 ? { accuracy } : {}) };
}

function validateForm(body) {
  if (!REQUEST_KINDS.includes(body.kind)) {
    throw new ApiError(400, "Please choose: a complaint, or a new requirement.");
  }

  const name = text(body.name);
  if (!name) throw new ApiError(400, "Please enter your name.");
  if (name.length > NAME_MAX) throw new ApiError(400, `Please keep your name under ${NAME_MAX} characters.`);

  const phone = text(body.phone);
  const digits = phone.replace(/\D/g, "");
  if (!PHONE_PATTERN.test(phone) || digits.length < 7 || digits.length > 15) {
    throw new ApiError(400, "Please enter a valid phone number.");
  }

  // Required only when the caller is not a known customer (submitPublicForm).
  const address = text(body.address);
  if (address.length > ADDRESS_LIMITS.max) {
    throw new ApiError(400, `Please keep the address under ${ADDRESS_LIMITS.max} characters.`);
  }

  const description = text(body.description);
  if (description.length < DESCRIPTION_LIMITS.min) throw new ApiError(400, "Please tell us a little more.");
  if (description.length > DESCRIPTION_LIMITS.max) {
    throw new ApiError(400, `Please keep the description under ${DESCRIPTION_LIMITS.max} characters.`);
  }

  const callbackTime = body.callbackTime || null;
  if (callbackTime && !CALLBACK_TIMES.includes(callbackTime)) {
    throw new ApiError(400, "Please choose a time from the list.");
  }

  const companyName = text(body.companyName);
  if (companyName.length > COMPANY_NAME_MAX) {
    throw new ApiError(400, `Please keep the name under ${COMPANY_NAME_MAX} characters.`);
  }

  return {
    kind: body.kind,
    name,
    phone,
    address: address || null,
    companyName: companyName || null,
    description,
    callbackTime,
    location: parseLocation(body),
  };
}

/**
 * POST /public/complaints/check-phone { phone } — is this a known customer?
 * Answers ONLY { matched }: never a name, id or anything else. A complete
 * 10-digit Indian mobile is required (+91, a leading 0, spaces and dashes
 * are dropped). Strictly rate-limited at the route.
 */
export async function checkPhone({ phone } = {}) {
  const mobile = normalizeIndianMobile(phone);
  if (!mobile) {
    throw new ApiError(400, "Please enter a 10-digit mobile number.");
  }
  return { matched: Boolean(await findCustomerByPhone(mobile)) };
}

/**
 * GET /public/complaints/link/:token — a customer's own link: the form comes
 * prefilled. Only what the customer would type themselves: the name on the
 * account, the main contact and number, the site address. No ids.
 */
export async function getLinkPrefill(token) {
  const customer = await findCustomerByComplaintToken(token);
  if (!customer) throw new ApiError(404, INVALID_LINK_MESSAGE);
  const contact = await Contact.findOne({ customerId: customer._id, isPrimary: true }).sort({ createdAt: 1 }).lean();
  return {
    customerName: customer.companyName,
    contactName: contact?.name ?? null,
    phone: contact?.phone || customer.phone || null,
    address: customer.siteAddress ?? null,
  };
}

/** Who is complaining: their own link, else their phone; null = not a known customer. */
async function resolveCustomer(form, linkToken) {
  if (linkToken !== undefined && linkToken !== "") {
    const customer = await findCustomerByComplaintToken(linkToken);
    if (!customer) throw new ApiError(404, INVALID_LINK_MESSAGE);
    return customer;
  }
  return findCustomerByPhone(form.phone);
}

function shorten(value, max = 60) {
  return value.length > max ? `${value.slice(0, max - 3)}…` : value;
}

/**
 * POST /public/complaints (multipart: kind, name, phone, address?, companyName?,
 * linkToken?, lat?, lng?, locationAccuracy?, description, callbackTime?,
 * photos[] — complaints only). linkToken = the customer's own link.
 */
export async function submitPublicForm(body, files = []) {
  const form = validateForm(body);
  const customer = await resolveCustomer(form, body.linkToken);

  // Not a known customer (2026-10-23): who they are and where — the browser
  // asks, but the server is the one that insists.
  if (!customer) {
    if (!form.companyName) throw new ApiError(400, "Please enter your company or household name.");
    if (!form.address || form.address.length < ADDRESS_LIMITS.min) throw new ApiError(400, "Please enter your address.");
  }

  if (form.kind === "requirement") {
    await createLeadFromComplaintForm({ ...form, companyName: customer?.companyName ?? form.companyName });
    return { kind: "requirement" };
  }

  const photos = checkPhotos(files);

  const uploaded = [];
  for (const photo of photos) {
    uploaded.push(await uploadComplaintPhoto(photo.buffer, photo.type));
  }

  const statusToken = crypto.randomBytes(STATUS_TOKEN_BYTES).toString("base64url");
  const number = await nextTicketNumber();
  const who = customer ? customer.companyName : `${form.companyName} (${form.name})`;

  const ticket = await Ticket.create({
    subject: shorten(form.description),
    customerId: customer?._id ?? null,
    category: "other",
    source: "complaint_link",
    number,
    callbackTime: form.callbackTime,
    contactName: form.name,
    contactPhone: form.phone,
    companyName: customer ? null : form.companyName,
    address: form.address ?? customer?.siteAddress ?? null,
    location: form.location,
    statusTokenHash: hashStatusToken(statusToken),
    unassignedSince: new Date(),
    customerPhotos: uploaded.map(({ publicId }) => ({ publicId })),
    history: [{ type: "comment", byCustomer: true, comment: form.description }],
  });

  const assigners = await findComplaintAssigners();
  const message = `New complaint ${number} from ${who}: ${shorten(form.description)}`;
  for (const assigner of assigners) {
    await createNotification(assigner._id, "complaint_new", message, { module: "complaints", id: ticket._id });
  }

  kickComplaintChecks();

  return { kind: "complaint", number, statusToken };
}

/** GET /public/complaints/status/:token */
export async function getPublicStatus(token) {
  if (typeof token !== "string" || !STATUS_TOKEN_PATTERN.test(token)) {
    throw new ApiError(404, INVALID_STATUS_LINK_MESSAGE);
  }
  const ticket = await Ticket.findOne({ statusTokenHash: hashStatusToken(token), source: "complaint_link" })
    .select("number status assignedToId visitDate createdAt updatedAt resolvedAt")
    .lean();
  if (!ticket) {
    throw new ApiError(404, INVALID_STATUS_LINK_MESSAGE);
  }

  kickComplaintChecks();

  const status = publicStatus(ticket.status);
  const technician =
    status !== "received" && ticket.assignedToId ? await User.findById(ticket.assignedToId).select("name").lean() : null;

  return {
    number: ticket.number,
    status,
    technicianName: firstName(technician?.name),
    visitDate: status !== "received" ? ticket.visitDate ?? null : null,
    raisedAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    resolvedAt: status === "resolved" ? ticket.resolvedAt ?? null : null,
  };
}
