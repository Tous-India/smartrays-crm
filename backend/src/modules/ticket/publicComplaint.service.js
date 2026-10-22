import ApiError from "../../utils/ApiError.js";
import { uploadComplaintPhoto } from "../../services/cloudinary.service.js";
import { createNotification } from "../notification/notification.service.js";
import User from "../user/user.model.js";
import Ticket, { COMPLAINT_CATEGORIES, CALLBACK_TIMES } from "./ticket.model.js";
import { nextTicketNumber } from "./ticketCounter.model.js";
import { findCustomerByComplaintToken } from "./complaintLink.service.js";
import { kickComplaintChecks } from "./ticketEscalation.service.js";

/**
 * The public complaint page behind a customer's link — no login. Everything
 * it returns is about this one customer, and nothing carries an internal id:
 * the customer's name, and their own link-raised complaints by number.
 */

// One message for every way a link can be wrong (unknown, malformed,
// customer deactivated, link reset) — it must not reveal which.
export const INVALID_LINK_MESSAGE = "This link is not valid. Please ask Smartrays for a new link.";

export const PHOTO_LIMITS = { maxCount: 3, maxBytes: 5 * 1024 * 1024 };
const DESCRIPTION_LIMITS = { min: 5, max: 1000 };
const RECENT_COMPLAINTS_SHOWN = 10;

const CATEGORY_LABELS = {
  sales_billing: "Sales / Billing",
  technical: "Technical / Not working",
  installation: "Installation",
  other: "Other",
};

// Which person each problem type goes to first. "Other" goes to the account
// owner — the customer's main contact at Smartrays.
const PREFERRED_ASSIGNEE = {
  sales_billing: "ownerId",
  technical: "projectManagerId",
  installation: "projectManagerId",
  other: "ownerId",
};

// What the customer sees: three plain words, not the internal states.
export function publicStatus(status) {
  if (status === "in_progress") return "in_progress";
  if (status === "resolved" || status === "closed") return "resolved";
  return "received";
}

async function customerOrThrow(token) {
  const customer = await findCustomerByComplaintToken(token);
  if (!customer) {
    throw new ApiError(404, INVALID_LINK_MESSAGE);
  }
  return customer;
}

/** GET /public/complaints/:token */
export async function getComplaintPage(token) {
  const customer = await customerOrThrow(token);
  kickComplaintChecks();

  const complaints = await Ticket.find({ customerId: customer._id, source: "complaint_link" })
    .sort({ createdAt: -1 })
    .limit(RECENT_COMPLAINTS_SHOWN)
    .select("number category status createdAt updatedAt")
    .lean();

  return {
    customerName: customer.companyName,
    complaints: complaints.map((ticket) => ({
      number: ticket.number,
      category: ticket.category,
      status: publicStatus(ticket.status),
      raisedAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
    })),
  };
}

// Magic bytes, not the file name or the browser's claimed type.
export function detectImageType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

function validateComplaint({ category, description, callbackTime }, files) {
  if (!COMPLAINT_CATEGORIES.includes(category)) {
    throw new ApiError(400, "Please choose what the problem is about.");
  }

  const text = typeof description === "string" ? description.trim() : "";
  if (text.length < DESCRIPTION_LIMITS.min) {
    throw new ApiError(400, "Please tell us a little more about the problem.");
  }
  if (text.length > DESCRIPTION_LIMITS.max) {
    throw new ApiError(400, `Please keep the description under ${DESCRIPTION_LIMITS.max} characters.`);
  }

  if (callbackTime && !CALLBACK_TIMES.includes(callbackTime)) {
    throw new ApiError(400, "Please choose a callback time from the list.");
  }

  if (files.length > PHOTO_LIMITS.maxCount) {
    throw new ApiError(400, `You can add up to ${PHOTO_LIMITS.maxCount} photos.`);
  }

  const photos = files.map((file) => {
    if (file.size > PHOTO_LIMITS.maxBytes) {
      throw new ApiError(400, "Each photo must be smaller than 5 MB.");
    }
    const type = detectImageType(file.buffer);
    if (!type) {
      throw new ApiError(400, "Only photos (JPG, PNG or WebP) can be added.");
    }
    return { buffer: file.buffer, type };
  });

  return { category, description: text, callbackTime: callbackTime || null, photos };
}

async function activeUser(userId) {
  if (!userId) return null;
  return User.findOne({ _id: userId, isActive: true }).select("_id name role managerId");
}

/**
 * Routing rule: the preferred person for this problem type; if they are not
 * an active user, the other of owner / project manager; if neither, the
 * first active admin. Exported for the staff UI's explanation text and tests.
 */
export async function pickAssignee(customer, category) {
  const preferredField = PREFERRED_ASSIGNEE[category] || "ownerId";
  const otherField = preferredField === "ownerId" ? "projectManagerId" : "ownerId";

  const preferred = await activeUser(customer[preferredField]);
  if (preferred) return preferred;

  const other = await activeUser(customer[otherField]);
  if (other) return other;

  return User.findOne({ role: "admin", isActive: true }).sort({ createdAt: 1 }).select("_id name role managerId");
}

/** POST /public/complaints/:token (multipart: category, description, callbackTime?, photos[]) */
export async function raiseComplaint(token, body, files = []) {
  const customer = await customerOrThrow(token);
  const complaint = validateComplaint(body, files);

  const assignee = await pickAssignee(customer, complaint.category);
  const uploaded = [];
  for (const photo of complaint.photos) {
    uploaded.push(await uploadComplaintPhoto(photo.buffer, photo.type));
  }

  const number = await nextTicketNumber();
  const label = CATEGORY_LABELS[complaint.category];
  const summary = complaint.description.length > 60 ? `${complaint.description.slice(0, 57)}…` : complaint.description;

  const ticket = await Ticket.create({
    subject: `${label} — ${summary}`,
    customerId: customer._id,
    category: complaint.category,
    source: "complaint_link",
    number,
    callbackTime: complaint.callbackTime,
    assignedToId: assignee?._id || null,
    customerPhotos: uploaded.map(({ publicId }) => ({ publicId })),
    history: [{ type: "comment", byCustomer: true, comment: complaint.description }],
  });

  if (assignee) {
    await createNotification(
      assignee._id,
      "complaint_assigned",
      `Complaint ${number} from ${customer.companyName}: ${label} — ${summary}`,
      { module: "complaints", id: ticket._id }
    );
  }

  kickComplaintChecks();

  return { number, status: publicStatus(ticket.status) };
}
