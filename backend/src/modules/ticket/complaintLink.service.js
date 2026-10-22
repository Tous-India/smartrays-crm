import crypto from "node:crypto";
import ApiError from "../../utils/ApiError.js";
import { env } from "../../config/env.js";
import { can } from "../../helpers/permission.helper.js";
import { encryptCredential, decryptCredential } from "../../services/credentialEncryption.service.js";
import { resolveOwnershipFilter } from "../customer/customer.service.js";
import Customer from "../customer/customer.model.js";

/**
 * The customer complaint link (2026-10-22): one link per customer, shared on
 * WhatsApp/SMS, that opens a public page where the customer raises a
 * complaint without logging in.
 *
 * The token is 24 random bytes (32 base64url characters, 192 bits) — not
 * guessable, and it carries no information. It is never stored readable:
 * `complaintLinkTokenHash` (SHA-256) is what an incoming link is looked up
 * by, and an AES-GCM copy (the Credentials vault key) lets staff copy the same
 * link again later. Resetting replaces both, so the old link stops working.
 */

const TOKEN_BYTES = 24;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}$/;
const LINK_SECRET_FIELDS = "+complaintLinkTokenHash +complaintLinkTokenEncrypted +complaintLinkTokenIv";

export function hashComplaintToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function isWellFormedComplaintToken(token) {
  return typeof token === "string" && TOKEN_PATTERN.test(token);
}

function complaintUrl(token) {
  return `${env.clientOrigin.replace(/\/+$/, "")}/c/${token}`;
}

/**
 * Who may see and share a customer's link: anyone who can view that customer
 * (customers.view, within their usual scope), plus the customer's own account
 * owner and project manager — who often hold the employee role, which has no
 * customers.view by default. 404 otherwise, never 403, matching the rest of
 * the customer module.
 */
async function getCustomerForLinkOrThrow(customerId, requestingUser) {
  const customer = await Customer.findById(customerId).select(LINK_SECRET_FIELDS);
  if (!customer) {
    throw new ApiError(404, "Customer not found");
  }

  const isOwnerOrPm = [customer.ownerId, customer.projectManagerId].some(
    (id) => id && String(id) === String(requestingUser._id)
  );
  if (isOwnerOrPm) {
    return customer;
  }

  if (can(requestingUser, "customers", "view")) {
    const inScope = await Customer.exists({ _id: customer._id, ...(await resolveOwnershipFilter(requestingUser)) });
    if (inScope) {
      return customer;
    }
  }

  throw new ApiError(404, "Customer not found");
}

async function issueNewToken(customer) {
  const token = crypto.randomBytes(TOKEN_BYTES).toString("base64url");
  const { passwordEncrypted, passwordIv } = encryptCredential(token);

  customer.complaintLinkTokenHash = hashComplaintToken(token);
  customer.complaintLinkTokenEncrypted = passwordEncrypted;
  customer.complaintLinkTokenIv = passwordIv;
  customer.complaintLinkCreatedAt = new Date();
  await customer.save();

  return token;
}

function linkResponse(customer, token) {
  return { url: complaintUrl(token), createdAt: customer.complaintLinkCreatedAt };
}

/** GET /customers/:id/complaint-link — the existing link, created on first use. */
export async function getComplaintLink(customerId, requestingUser) {
  const customer = await getCustomerForLinkOrThrow(customerId, requestingUser);

  if (customer.complaintLinkTokenEncrypted && customer.complaintLinkTokenIv) {
    const token = decryptCredential({
      passwordEncrypted: customer.complaintLinkTokenEncrypted,
      passwordIv: customer.complaintLinkTokenIv,
    });
    return linkResponse(customer, token);
  }

  return linkResponse(customer, await issueNewToken(customer));
}

/**
 * POST /customers/:id/complaint-link/reset — for a link that went to the wrong
 * person. customers.edit (or the owner / project manager) — checked here.
 */
export async function resetComplaintLink(customerId, requestingUser) {
  const customer = await getCustomerForLinkOrThrow(customerId, requestingUser);
  const isOwnerOrPm = [customer.ownerId, customer.projectManagerId].some(
    (id) => id && String(id) === String(requestingUser._id)
  );

  if (!isOwnerOrPm && !can(requestingUser, "customers", "edit")) {
    throw new ApiError(403, "You do not have permission to reset this customer's complaint link");
  }

  return linkResponse(customer, await issueNewToken(customer));
}

/**
 * The customer an incoming public link belongs to, or null. A malformed
 * token never reaches the database; an inactive customer counts as no
 * customer. Callers answer every null the same way.
 */
export async function findCustomerByComplaintToken(token) {
  if (!isWellFormedComplaintToken(token)) {
    return null;
  }

  const customer = await Customer.findOne({ complaintLinkTokenHash: hashComplaintToken(token) });
  if (!customer || customer.customerStatus === "inactive") {
    return null;
  }

  return customer;
}
