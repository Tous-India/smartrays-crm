/**
 * Display-only date helpers. Nothing here decides a rule.
 *
 * One Indian format everywhere (2026-10-23, owner's decision), the same as
 * the web: DD MMM YYYY, h:mm AM/PM. Built by hand rather than with
 * toLocale*String, whose output follows the phone's language setting (and
 * Hermes' Intl support) and so differed from phone to phone.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const pad2 = (number) => String(number).padStart(2, "0");

/** "03 Oct 2026" — a calendar date, no time. */
export function formatDate(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  return `${pad2(date.getDate())} ${MONTHS_SHORT[date.getMonth()]} ${date.getFullYear()}`;
}

/** "22 Sep" — for a due date in a compact row. */
export function formatShortDate(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  return `${pad2(date.getDate())} ${MONTHS_SHORT[date.getMonth()]}`;
}

/** "September 2026" — a month picker's label. */
export function formatMonth(date) {
  return `${MONTHS_LONG[date.getMonth()]} ${date.getFullYear()}`;
}

/** "1:05 PM" — a time of day. */
export function formatTime(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  const hours = date.getHours();
  return `${hours % 12 || 12}:${pad2(date.getMinutes())} ${hours < 12 ? "AM" : "PM"}`;
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
