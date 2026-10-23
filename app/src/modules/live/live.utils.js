// Live employee status (2026-10-23): plain words for what the server sends.
// The names and colours themselves come from GET /location/config.

export const COUNTED = ["moving", "stationary", "at_site", "offline", "location_off", "disconnected"];

// Filters that cover more than one status ("today at a glance").
export const FILTER_GROUPS = {
  on_shift: COUNTED,
  attention: ["location_off", "disconnected"],
};

export const GROUP_LABELS = {
  on_shift: "On shift",
  attention: "Need attention",
  not_checked_in: "Not checked in",
  checked_out: "Checked out",
  on_leave: "On leave",
};

/** Does this person match the list's filter — a status key or a group? */
export function matchesFilter(person, filter) {
  if (!filter) return true;
  return (FILTER_GROUPS[filter] ?? [filter]).includes(person.status);
}

// The same colours the server serves — used only until the config has loaded.
export const FALLBACK_META = {
  moving: { label: "Moving", color: "#1971c2" },
  stationary: { label: "Stationary", color: "#f08c00" },
  at_site: { label: "At site", color: "#2f9e44" },
  offline: { label: "Offline", color: "#868e96" },
  location_off: { label: "Location off", color: "#e03131" },
  disconnected: { label: "Disconnected", color: "#343a40" },
  checked_out: { label: "Checked out", color: "#495057" },
  not_checked_in: { label: "Not checked in", color: "#adb5bd" },
  on_leave: { label: "On leave", color: "#7048e8" },
};

export function metaFrom(statuses) {
  if (!statuses?.length) return FALLBACK_META;
  return Object.fromEntries(statuses.map((status) => [status.key, status]));
}

export function minutesSince(iso, now = Date.now()) {
  return iso ? Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000)) : null;
}

export function duration(minutes) {
  if (minutes === null || minutes === undefined) return "";
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
}

/** The line under a name: what the status means right now. */
export function detailLine(person, now = Date.now()) {
  const parts = [];
  if (person.status === "moving" && person.speedKmh) parts.push(`about ${person.speedKmh} km/h`);
  if (person.status === "stationary") parts.push(`at the same place for ${duration(minutesSince(person.since, now))}`);
  if (person.place) parts.push(person.place);
  if (person.status === "offline" || person.status === "disconnected") parts.push(`last synced ${duration(minutesSince(person.lastSyncAt, now))} ago`);
  if (person.status === "location_off") parts.push(`for ${duration(minutesSince(person.since, now))}`);
  return parts.join(" · ");
}

// What an employee can do about their own status (GET /location/my-status `fix`).
export const FIX_TEXT = {
  turn_on_location: { message: "Location is off on your phone, so your manager cannot see you.", action: "Turn on location" },
  check_internet: { message: "No internet. Your locations are saved and will upload when you are back online.", action: "Open Wi-Fi settings" },
  open_app: { message: "Nothing has reached the office from your phone for a while.", action: "Check tracking" },
  charge_phone: { message: "Battery is low. Please charge your phone so tracking keeps working.", action: null },
};

/** Today's YYYY-MM-DD in India (the server's day for the timeline), whatever the phone's zone. */
export function todayKey(now = new Date()) {
  const india = new Date(now.getTime() + 330 * 60000);
  return `${india.getUTCFullYear()}-${String(india.getUTCMonth() + 1).padStart(2, "0")}-${String(india.getUTCDate()).padStart(2, "0")}`;
}
