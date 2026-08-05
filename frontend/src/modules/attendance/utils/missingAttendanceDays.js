import dayjs from "dayjs";

/**
 * The days in [from, to] that a given employee has NO attendance record for
 * (2026-08-05) — the rows `POST /attendance/mark-status` exists to fill.
 *
 * The table only ever rendered real records, so a day someone never checked
 * in simply wasn't in it: there was no row to hang a "Mark Absent" action
 * off. These synthetic rows are what make the gap visible in the first
 * place, and they are only ever generated for ONE employee at a time (the
 * Employee filter must be set) — "which days are missing" is a per-person
 * question, and generating it org-wide would add employees × days rows to a
 * table that otherwise shows real events only.
 *
 * Future dates are excluded: a day that hasn't happened yet isn't a gap, and
 * marking someone absent for next Tuesday would be nonsense. Today itself is
 * included — a shift that never started is a real, markable absence.
 */
export function findMissingAttendanceDays({ records, employeeId, from, to, today = dayjs() }) {
  if (!employeeId) {
    return [];
  }

  const recordedDayKeys = new Set(
    records
      .filter((record) => String(record.employeeId) === String(employeeId))
      .map((record) => dayjs(record.date).format("YYYY-MM-DD"))
  );

  const lastDay = to.isAfter(today, "day") ? today : to;
  const missing = [];
  let cursor = from.startOf("day");

  while (cursor.isBefore(lastDay, "day") || cursor.isSame(lastDay, "day")) {
    const dayKey = cursor.format("YYYY-MM-DD");

    if (!recordedDayKeys.has(dayKey)) {
      missing.push({
        // Prefixed so it can never collide with a real Mongo `_id`, and so
        // `isMissingDay` isn't the only thing distinguishing the two.
        _id: `missing-${employeeId}-${dayKey}`,
        employeeId,
        // A plain `YYYY-MM-DD` day key, not an ISO timestamp: `toISOString()`
        // would convert local midnight to UTC and land on the PREVIOUS day
        // for any timezone east of UTC, so the row would render — and be
        // submitted — one day off. dayjs parses this form as local midnight,
        // which is exactly the day the user sees in the Date column.
        date: dayKey,
        isMissingDay: true,
      });
    }

    cursor = cursor.add(1, "day");
  }

  return missing;
}

export default findMissingAttendanceDays;
