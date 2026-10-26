// The month view of my attendance (2026-10-23): the summary and the calendar.
//
// The summary is the WEB's rule, copied, not a new one —
// frontend/src/modules/attendance/utils/attendanceSummary.js:
//   attended days = present + ½ × half_day
//   rate          = attended ÷ Monday–Saturday working days that have happened
//   counted per person per DAY (2026-10-26, owner) — not per record
// Change both together. Nothing here decides a status: every day's colour is
// the status the server gave its record.

const COUNTABLE_STATUSES = ["present", "absent", "half_day", "on_leave"];
// Sunday is the weekly off (the web's WEEKLY_OFF_DAYS).
const WEEKLY_OFF_DAYS = [0];
const DAY_RANK = ["present", "half_day", "on_leave", "absent"];
const INDIA_OFFSET_MS = 330 * 60 * 1000;

function startOfLocalDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Working days from `from` to `to` (inclusive), counting only days up to today. */
function countWorkingDays(from, to, now) {
  const last = startOfLocalDay(to) > startOfLocalDay(now) ? startOfLocalDay(now) : startOfLocalDay(to);
  let count = 0;

  for (let day = startOfLocalDay(from); day <= last; day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)) {
    if (!WEEKLY_OFF_DAYS.includes(day.getDay())) {
      count += 1;
    }
  }

  return count;
}

export function computeAttendanceSummary(records, { from, to, peopleCount = 1, now = new Date() }) {
  const counts = { present: 0, absent: 0, half_day: 0, on_leave: 0 };
  let hours = 0;

  // One status per person per DAY (2026-10-26, owner's decision — same as the
  // web): several shifts on a day count once, as the day's best outcome.
  // Hours still add up across every shift.
  const byDay = new Map();
  records.forEach((record, index) => {
    if (COUNTABLE_STATUSES.includes(record.status)) {
      const key = record.date ? `${record.employeeId ?? ""}|${indiaDate(record.date).join("-")}` : `#${index}`;
      const current = byDay.get(key);
      if (!current || DAY_RANK.indexOf(record.status) < DAY_RANK.indexOf(current)) {
        byDay.set(key, record.status);
      }
    }
    if (typeof record.workingHours === "number") {
      hours += record.workingHours;
    }
  });
  byDay.forEach((status) => {
    counts[status] += 1;
  });

  const workingDays = countWorkingDays(from, to, now);
  const expectedDays = workingDays * Math.max(0, peopleCount);
  const attendedDays = counts.present + counts.half_day * 0.5;
  const attendanceRate =
    expectedDays > 0 ? Math.min(100, Math.round((attendedDays / expectedDays) * 1000) / 10) : null;

  return { ...counts, workingDays, peopleCount, expectedDays, attendedDays, attendanceRate, hours: Math.round(hours * 100) / 100 };
}

/** The India calendar date of an instant, as [year, monthIndex, day]. */
function indiaDate(value) {
  const shifted = new Date(new Date(value).getTime() + INDIA_OFFSET_MS);
  return [shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()];
}

// When a day has more than one record, the one that shows: an open shift,
// then the best outcome.
const RANK = ["on_shift", "present", "half_day", "on_leave", "absent"];

function kindOf(record) {
  if (record.checkIn?.time && !record.checkOut?.time) return "on_shift";
  return COUNTABLE_STATUSES.includes(record.status) ? record.status : null;
}

/**
 * The month as weeks (Monday first), each slot null (outside the month) or
 * { day, date, kind, isToday, records } — kind is the record's status
 * (present / half_day / absent / on_leave), "on_shift" for an open shift,
 * "off" for a Sunday with nothing recorded, "none" for a past working day
 * with nothing recorded, "future" for a day still to come.
 */
export function buildMonthDays(month, records, { now = new Date() } = {}) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const [todayY, todayM, todayD] = indiaDate(now);
  const todayStamp = Date.UTC(todayY, todayM, todayD);

  const byDay = new Map();
  records.forEach((record) => {
    const [y, m, d] = indiaDate(record.date || record.checkIn?.time);
    if (y === year && m === monthIndex) {
      byDay.set(d, [...(byDay.get(d) || []), record]);
    }
  });

  const slots = [];
  // Monday-first: getUTCDay 1 (Mon) → 0 blanks … 0 (Sun) → 6 blanks.
  const firstWeekday = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
  for (let blank = 0; blank < (firstWeekday + 6) % 7; blank += 1) slots.push(null);

  for (let day = 1; day <= daysInMonth; day += 1) {
    const stamp = Date.UTC(year, monthIndex, day);
    const dayRecords = byDay.get(day) || [];
    const kinds = dayRecords.map(kindOf).filter(Boolean);
    const best = RANK.find((kind) => kinds.includes(kind));
    let kind = best;
    if (!kind) {
      if (stamp > todayStamp) kind = "future";
      else if (WEEKLY_OFF_DAYS.includes(new Date(stamp).getUTCDay())) kind = "off";
      else kind = "none";
    }
    slots.push({ day, date: new Date(year, monthIndex, day), kind, isToday: stamp === todayStamp, records: dayRecords });
  }

  while (slots.length % 7 !== 0) slots.push(null);

  const weeks = [];
  for (let index = 0; index < slots.length; index += 7) weeks.push(slots.slice(index, index + 7));
  return weeks;
}

