import dayjs from "dayjs";

const COUNTABLE_STATUSES = ["present", "absent", "half_day", "on_leave"];

// Sunday is the weekly off; Monday–Saturday are working days (2026-10-23).
// Change here if the company's working week changes.
const WEEKLY_OFF_DAYS = [0]; // 0 = Sunday

/**
 * The attendance summary over records already fetched for a view.
 *
 * RATE (redefined 2026-10-23, owner's decision):
 *
 *   rate = attended days ÷ (people in view × working days that have happened)
 *
 *   attended days = present + ½ × half_day (the weighting
 *   analytics.service.js#getAttendanceTrend already uses)
 *
 * It replaced `attended ÷ Monday–Friday days in the whole month`, which was
 * right only for one person's month: in the team/admin views it added every
 * person's days but divided by ONE person's month (3 of 8 people present
 * today showed 13.6 %), it counted days still to come (everyone looked low
 * mid-month), and it left Saturdays out of the denominator while worked
 * Saturdays counted in the numerator (a full-timer could pass 100 %).
 *
 * `from`/`to` are the period shown; `peopleCount` is how many people the view
 * covers; `now` is injectable for tests. `attendanceRate` is null when no
 * working day has happened yet in the period, and never above 100.
 */
export function computeAttendanceSummary(records, { from, to, peopleCount = 1, now = dayjs() }) {
  const counts = { present: 0, absent: 0, half_day: 0, on_leave: 0 };

  records.forEach((record) => {
    if (COUNTABLE_STATUSES.includes(record.status)) {
      counts[record.status] += 1;
    }
  });

  const workingDays = countWorkingDays(dayjs(from), dayjs(to), dayjs(now));
  const expectedDays = workingDays * Math.max(0, peopleCount);
  const attendedDays = counts.present + counts.half_day * 0.5;
  const attendanceRate =
    expectedDays > 0 ? Math.min(100, Math.round((attendedDays / expectedDays) * 1000) / 10) : null;

  return { ...counts, workingDays, peopleCount, expectedDays, attendedDays, attendanceRate };
}

/** Working days from `from` to `to` (inclusive), counting only days up to today. */
function countWorkingDays(from, to, now) {
  const last = to.isAfter(now, "day") ? now.startOf("day") : to.startOf("day");
  let count = 0;

  for (let day = from.startOf("day"); !day.isAfter(last, "day"); day = day.add(1, "day")) {
    if (!WEEKLY_OFF_DAYS.includes(day.day())) {
      count += 1;
    }
  }

  return count;
}

export default computeAttendanceSummary;
