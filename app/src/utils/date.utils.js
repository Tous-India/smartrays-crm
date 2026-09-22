/**
 * Display-only date helpers. Nothing here decides a rule; the server's
 * dates are shown in the device's locale.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** "22 Sep 2026" — a calendar date, no time. */
export function formatDate(value) {
  if (!value) {
    return "—";
  }

  return new Date(value).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
}

/** "22 Sep" — for a due date in a compact row. */
export function formatShortDate(value) {
  if (!value) {
    return "";
  }

  return new Date(value).toLocaleDateString([], { day: "numeric", month: "short" });
}

/** "September 2026" — a month picker's label. */
export function formatMonth(date) {
  return date.toLocaleDateString([], { month: "long", year: "numeric" });
}

/** Local midnight of the day `value` falls in. */
export function startOfDay(value) {
  const date = new Date(value);

  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Whole calendar days from today to `value` — negative when it has passed. */
export function daysFromToday(value, now = new Date()) {
  return Math.round((startOfDay(value).getTime() - startOfDay(now).getTime()) / DAY_MS);
}

/** `YYYY-MM-DD` of a Date in local time — what a date field sends. */
export function toDateKey(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${date.getFullYear()}-${month}-${day}`;
}
