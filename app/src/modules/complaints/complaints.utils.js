// Plain words for customer complaints (2026-10-22), matching the web's.

export const COMPLAINT_STATUS = { OPEN: "open", IN_PROGRESS: "in_progress", RESOLVED: "resolved", CLOSED: "closed" };

export const STATUS_LABEL = { open: "Waiting", in_progress: "In progress", resolved: "Resolved", closed: "Resolved" };
export const STATUS_TONE = { open: "neutral", in_progress: "warning", resolved: "success", closed: "success" };

export const CATEGORY_LABEL = {
  technical: "Not working",
  sales_billing: "Billing / Payment",
  installation: "Installation",
  other: "Something else",
  new_project: "New project",
  existing_client_query: "Customer query",
};

export const CALLBACK_LABEL = {
  morning: "Morning (9 – 12)",
  afternoon: "Afternoon (12 – 4)",
  evening: "Evening (4 – 7)",
  anytime: "Any time",
};

// The server escalates after these (ticketEscalation.service.js).
const ACKNOWLEDGE_HOURS = 4;
const RESOLVE_HOURS = 48;
const HOUR = 3600000;

export function isActive(ticket) {
  return ticket.status === COMPLAINT_STATUS.OPEN || ticket.status === COMPLAINT_STATUS.IN_PROGRESS;
}

/** "Not picked up for 6 h" / "Open 3 days" when past the rule, else null. */
export function overdueText(ticket, now = Date.now()) {
  const ageHours = (now - new Date(ticket.createdAt).getTime()) / HOUR;
  if (ticket.status === COMPLAINT_STATUS.OPEN && ageHours >= ACKNOWLEDGE_HOURS) return `Not picked up for ${Math.floor(ageHours)} h`;
  if (ticket.status === COMPLAINT_STATUS.IN_PROGRESS && ageHours >= RESOLVE_HOURS) return `Open ${Math.floor(ageHours / 24)} days`;
  return null;
}

/** Active first, overdue first among them, then oldest first. */
export function sortForWork(tickets, now = Date.now()) {
  return [...tickets].sort((a, b) => {
    const active = Number(isActive(b)) - Number(isActive(a));
    if (active) return active;
    const overdue = Number(Boolean(overdueText(b, now))) - Number(Boolean(overdueText(a, now)));
    if (overdue) return overdue;
    return new Date(a.createdAt) - new Date(b.createdAt);
  });
}

export function timeAgo(iso, now = Date.now()) {
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}
