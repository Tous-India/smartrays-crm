// Sharing the one public complaint link (2026-10-23) — on WhatsApp, by SMS,
// or copied. Free: wa.me and sms: links open the phone's own apps (WhatsApp
// Web on a computer).

export function complaintFormUrl(origin = window.location.origin) {
  return `${origin.replace(/\/+$/, "")}/complaint`;
}

export function complaintShareText(url = complaintFormUrl()) {
  return `For any issue with your solar system, tell us here: ${url}`;
}

/** "+91 98100 12345" → "919810012345"; a bare 10-digit number gets India's 91. */
export function internationalDigits(phone) {
  const digits = String(phone || "").replace(/\D/g, "").replace(/^0+/, "");
  if (!digits) return "";
  return digits.length === 10 ? `91${digits}` : digits;
}

export function whatsAppHref(text, phone) {
  const to = internationalDigits(phone);
  return `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
}

export function smsHref(text, phone) {
  const to = internationalDigits(phone);
  return `sms:${to ? `+${to}` : ""}?body=${encodeURIComponent(text)}`;
}
