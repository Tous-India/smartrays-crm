// Plain "3 h ago" wording, and the same overdue rule the server escalates on
// (ticketEscalation.service.js: not picked up in 4 h, not resolved in 48 h).

const HOUR = 3600000;
export const ACKNOWLEDGE_HOURS = 4;
export const RESOLVE_HOURS = 48;

export function timeAgo(iso, now = Date.now()) {
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

/** "Not picked up for 6 h" / "Open 3 days" when past the rule, else null. */
export function overdueText(ticket, now = Date.now()) {
  const ageHours = (now - new Date(ticket.createdAt).getTime()) / HOUR;
  if (ticket.status === "open" && ageHours >= ACKNOWLEDGE_HOURS) {
    return `Not picked up for ${Math.floor(ageHours)} h`;
  }
  if (ticket.status === "in_progress" && ageHours >= RESOLVE_HOURS) {
    return `Open ${Math.floor(ageHours / 24)} days`;
  }
  return null;
}
