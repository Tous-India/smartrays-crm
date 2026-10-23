import { formatTime } from "../../utils/date.utils";
/**
 * Pure helpers over the attendance records `GET /attendance/me` returns.
 * They only READ what the server decided; nothing here computes a status,
 * hours or a rule (final-plan.md §7.4 owns those).
 */

/** `YYYY-MM` for the month `date` falls in — the query the endpoint takes. */
export function monthKey(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, "0");

  return `${date.getFullYear()}-${month}`;
}

function isSameLocalDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * The one open shift: a real check-in with no check-out yet. The same rule
 * as the web's useMyAttendance — a record with neither time (a manual mark,
 * a leave day) is not an open shift.
 */
export function findOpenRecord(records = []) {
  return records.find((record) => record?.checkIn?.time && !record?.checkOut?.time) || null;
}

/**
 * Today's most recent record, open or closed — what the card shows once a
 * shift has ended. A record's `date` is the server's start-of-day, compared
 * on the device's calendar day.
 */
export function findTodayRecord(records = [], now = new Date()) {
  const today = records.filter((record) => record?.date && isSameLocalDay(new Date(record.date), now));

  if (today.length === 0) {
    return null;
  }

  return today.reduce((latest, record) => {
    const latestTime = new Date(latest.checkIn?.time || latest.date).getTime();
    const recordTime = new Date(record.checkIn?.time || record.date).getTime();

    return recordTime > latestTime ? record : latest;
  });
}

/** "2h 05m" between two instants; never negative. */
export function formatElapsed(fromIso, now = new Date()) {
  const diffMs = Math.max(0, now.getTime() - new Date(fromIso).getTime());
  const totalMinutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

/** "9:12 AM" — the shared time format (utils/date.utils.js, 2026-10-23). */
export function formatClockTime(iso) {
  return formatTime(iso);
}

/** "±12 m" for a fix's accuracy, or "" when the fix carries none. */
export function formatAccuracy(accuracy) {
  if (typeof accuracy !== "number" || Number.isNaN(accuracy)) {
    return "";
  }

  return `±${Math.round(accuracy)} m`;
}
