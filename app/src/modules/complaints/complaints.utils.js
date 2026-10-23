import Config from "react-native-config";
import { toDateKey } from "../../utils/date.utils";

// Plain words for customer complaints (2026-10-23), matching the web's.

export const STATUS_LABEL = {
  open: "Not assigned",
  assigned: "Assigned",
  on_the_way: "On the way",
  working: "Working",
  resolved: "Resolved",
  closed: "Resolved",
};
export const STATUS_TONE = {
  open: "danger",
  assigned: "info",
  on_the_way: "info",
  working: "warning",
  resolved: "success",
  closed: "success",
};

// The technician's steps after Assigned, in order.
export const WORK_STEPS = [
  { value: "on_the_way", label: "On the way" },
  { value: "working", label: "Working" },
  { value: "resolved", label: "Resolved" },
];
const STEP_INDEX = { assigned: 0, on_the_way: 1, working: 2, resolved: 3 };

export const PRIORITIES = [
  { value: "low", label: "Low", tone: "neutral" },
  { value: "medium", label: "Medium", tone: "info" },
  { value: "high", label: "High", tone: "warning" },
  { value: "urgent", label: "Urgent", tone: "danger" },
];
export const PRIORITY = Object.fromEntries(PRIORITIES.map((p) => [p.value, p]));

export const CALLBACK_LABEL = {
  morning: "Morning (9 – 12)",
  afternoon: "Afternoon (12 – 4)",
  evening: "Evening (4 – 7)",
  anytime: "Any time",
};

export function isResolved(complaint) {
  return complaint.status === "resolved" || complaint.status === "closed";
}

export function isActive(complaint) {
  return !isResolved(complaint);
}

/** The steps still ahead of this complaint — none until it is assigned. */
export function nextSteps(complaint) {
  const current = STEP_INDEX[complaint.status];
  if (current === undefined || isResolved(complaint)) return [];
  return WORK_STEPS.filter((step) => STEP_INDEX[step.value] > current);
}

/** Its visit date is before today and it is still being worked on. */
export function isVisitOverdue(complaint, today = new Date()) {
  if (!complaint.visitDate || complaint.status === "open" || isResolved(complaint)) return false;
  return complaint.visitDate < toDateKey(today);
}

export function timeAgo(iso, now = Date.now()) {
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

/** Google Maps at the phone's GPS pin when the customer shared it, else the typed address. */
export function mapsUrl(complaint) {
  const query = complaint.location ? `${complaint.location.lat},${complaint.location.lng}` : encodeURIComponent(complaint.address || "");
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

// --- sharing the one public complaint form ---

/** `https://crm…/complaint`, or null when the build has no WEB_APP_URL. */
export function complaintFormUrl() {
  return Config.WEB_APP_URL ? `${Config.WEB_APP_URL.replace(/\/+$/, "")}/complaint` : null;
}

export function complaintShareText(url) {
  return `For any issue with your solar system, tell us here: ${url}`;
}
