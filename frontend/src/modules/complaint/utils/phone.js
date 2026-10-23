/**
 * A complete Indian mobile as 10 digits, or null — the server's rule
 * (complaintPeople.js#normalizeIndianMobile): spaces, dashes and brackets
 * dropped, then a 91 country code or a leading 0. "+…" means a country code
 * is coming: not complete until it is +91 and 10 digits.
 */
export function normalizeMobile(phone) {
  const raw = String(phone || "").trim();
  let digits = raw.replace(/\D/g, "");
  if (raw.startsWith("+")) return digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : null;
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return /^\d{10}$/.test(digits) ? digits : null;
}
