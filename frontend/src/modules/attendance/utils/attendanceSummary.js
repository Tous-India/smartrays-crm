const COUNTABLE_STATUSES = ["present", "absent", "half_day", "on_leave"];

/**
 * Client-side summary over an already-fetched month's records — no new
 * endpoint needed: every record already carries its own `status`, and that's
 * all this computes from. "Working days" has no existing precedent
 * anywhere in this codebase (Payroll's own `daysInMonth`, `payroll.service.js
 * #computePayrollFields`, counts every calendar day including weekends, for
 * its own pro-rata salary math) — defined here as weekday count (Mon-Fri)
 * instead, deliberately different from Payroll's convention: a day with no
 * Attendance record (a weekend) is never treated as absent, so counting it
 * in this percentage's denominator would make every employee's attendance
 * rate look artificially low for simply having weekends off.
 *
 * `half_day` counts as 0.5 of an attended day, matching the exact weighting
 * `backend/src/modules/report/analytics.service.js#getAttendanceTrend`
 * already established for "attendance rate" as a concept in this codebase
 * - reused here rather than a second, differently-weighted definition of
 * the same phrase.
 */
export function computeAttendanceSummary(records, month) {
  const counts = { present: 0, absent: 0, half_day: 0, on_leave: 0 };

  records.forEach((record) => {
    if (COUNTABLE_STATUSES.includes(record.status)) {
      counts[record.status] += 1;
    }
  });

  const workingDays = countWeekdaysInMonth(month);
  const attendedDays = counts.present + counts.half_day * 0.5;
  const attendanceRate = workingDays > 0 ? Math.round((attendedDays / workingDays) * 1000) / 10 : 0;

  return { ...counts, workingDays, attendanceRate };
}

function countWeekdaysInMonth(month) {
  const daysInMonth = month.daysInMonth();
  let weekdays = 0;

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dayOfWeek = month.date(day).day(); // 0 = Sunday, 6 = Saturday
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      weekdays += 1;
    }
  }

  return weekdays;
}

export default computeAttendanceSummary;
