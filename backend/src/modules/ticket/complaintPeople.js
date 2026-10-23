import User from "../user/user.model.js";
import Customer from "../customer/customer.model.js";
import Contact from "../customer/contact.model.js";

/**
 * Who handles customer complaints (2026-10-23): every active admin, plus
 * every active user granted `complaints.assign` from the Permissions screen
 * (e.g. an office coordinator). They see the full list, receive every new
 * complaint and every reminder. Mirrors `can(user, "complaints", "assign")`.
 */
export async function findComplaintAssigners() {
  return User.find({
    isActive: true,
    $or: [{ role: "admin" }, { "permissions.complaints.assign": true }],
  }).select("_id name");
}

/** "Suresh Kumar" → "Suresh" — what the customer is told. */
export function firstName(name) {
  return typeof name === "string" && name.trim() ? name.trim().split(/\s+/)[0] : null;
}

// India mobiles are matched on their last 10 digits, so "+91 98100 12345",
// "098100-12345" and "9810012345" are the same number.
const MATCH_DIGITS = 10;

function phonePattern(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length < 7) return null;
  const tail = digits.slice(-MATCH_DIGITS);
  // Each digit may be followed by spaces, dashes or brackets in the stored value.
  return new RegExp(`${tail.split("").join("\\D*")}\\D*$`);
}

/**
 * The existing customer this phone number belongs to — the customer's own
 * phone first, then any of its contacts' phones. Null when nobody matches.
 */
export async function findCustomerByPhone(phone) {
  const pattern = phonePattern(phone);
  if (!pattern) return null;

  const direct = await Customer.findOne({ phone: pattern }).sort({ createdAt: 1 }).select("_id companyName commissioningDate");
  if (direct) return direct;

  const contact = await Contact.findOne({ phone: pattern }).sort({ createdAt: 1 }).select("customerId");
  if (!contact) return null;
  return Customer.findById(contact.customerId).select("_id companyName commissioningDate");
}
