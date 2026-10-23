// Plain "3 h ago" wording for the complaints list (2026-10-22).

export function timeAgo(iso, now = Date.now()) {
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

/** True once the visit date (India "YYYY-MM-DD") is before today and it is not resolved. */
export function isVisitOverdue(complaint, today = new Date()) {
  if (!complaint.visitDate || ["resolved", "closed", "open"].includes(complaint.status)) return false;
  const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return complaint.visitDate < key;
}
