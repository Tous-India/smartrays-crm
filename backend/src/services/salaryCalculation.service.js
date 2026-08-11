import Attendance from "../modules/attendance/attendance.model.js";
import Leave from "../modules/leave/leave.model.js";
import User from "../modules/user/user.model.js";

/**
 * THE salary calculator (§7.47, 2026-08-11) — one place, deliberately.
 *
 * The monthly report and the Payroll module compute the same figures. Payroll's
 * run has never fired in production; when it is fixed it must consume THIS,
 * not its own copy. Two independent salary calculations will eventually
 * disagree, and the disagreement does not surface as a failing test — it
 * surfaces as a disputed payslip, months later, with two numbers and no way to
 * say which is right.
 *
 * LEAVE MODEL (§11.7, resolved 2026-07-13, re-confirmed 2026-08-11): ONE paid
 * leave day per calendar month, no carry-forward, no accumulated balance.
 * There is no opening balance, no monthly credit and no closing balance here
 * because there is no such thing in this system.
 */

/**
 * Per-day rate uses CALENDAR days, not working days.
 *
 * A 30,000 salary over 31 calendar days is 967.74/day; over ~22 working days it
 * would be 1363.64 — roughly 30% more deducted for the same single absence.
 * Calendar days is what the original requirement asked for ("according to the
 * number of days in a month") and is the reading that does not quietly inflate
 * every deduction.
 */
export function perDayRate(baseSalary, year, month) {
  return baseSalary / daysInMonth(year, month);
}

/** `month` is 1-based, matching the API rather than JS's 0-based Date. */
export function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function monthBounds(year, month) {
  const start = new Date(year, month - 1, 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(year, month, 1);
  end.setHours(0, 0, 0, 0);

  return { start, end };
}

/**
 * Half days count 0.5 EVERYWHERE — present, absent, paid, unpaid and therefore
 * deduction. A `half_day` record is half a day present and half a day absent,
 * so it contributes to both columns rather than being rounded into one.
 */
const HALF = 0.5;

/** Local date components, matching `monthBounds`'s own local-time construction. */
function dateKey(value) {
  const date = new Date(value);
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

export function computeEmployeeMonth({ user, attendance, leaves, year, month }) {
  const calendarDays = daysInMonth(year, month);

  const presentDays = attendance.reduce((total, record) => {
    if (record.status === "present") return total + 1;
    if (record.status === "half_day") return total + HALF;
    return total;
  }, 0);

  // Absence is resolved PER DATE, not by adding two independent counts.
  //
  // `markUnapprovedAbsence` writes no Attendance record at all — it only flips
  // the Leave row — so an unapproved absence never appears in `attendance`.
  // Summing the two lists separately therefore charged ONE day for a day the
  // policy says costs two: the day itself was invisible, leaving only the
  // doubling surcharge. Caught in the browser against real data, on a row
  // reading "Absent 0" beside a ×2 marker.
  // `on_leave` counts here too, and that is load-bearing. Approving a full-day
  // leave writes an `on_leave` Attendance record (`writeApprovedLeaveAttendance`),
  // so an approved paid day is NOT an `absent` record. Counting only `absent`
  // then subtracted the paid allowance from a total it had never been part of,
  // charging 1 day for 2 absences whenever someone actually used their paid
  // leave. "Absent" is days not worked; Paid/Unpaid Leave decompose it — which
  // is exactly the shape of the worked case (3 absent → 1 paid + 2 unpaid).
  const absentByDate = new Map();

  attendance.forEach((record) => {
    if (record.status === "absent" || record.status === "on_leave") {
      absentByDate.set(dateKey(record.date), 1);
    } else if (record.status === "half_day") {
      absentByDate.set(dateKey(record.date), HALF);
    }
  });

  // §7.5 — an unapproved absence deducts TWICE: once as the absent day it is,
  // once as the surcharge. Tracked per date so the day is counted exactly once
  // even when Attendance DOES have a record for it (a marked-absent day later
  // ruled unapproved), and so the surcharge count stays reportable.
  const unapprovedByDate = new Map();

  leaves
    .filter((leave) => leave.isDoubleDeduction)
    .forEach((leave) => {
      leaveDateKeys(leave, year, month).forEach((key) => {
        unapprovedByDate.set(key, leave.isHalfDay ? HALF : 1);
      });
    });

  unapprovedByDate.forEach((weight, key) => {
    // Attendance is the recorded truth where it exists; a leave row only fills
    // in a day nothing was recorded for.
    if (!absentByDate.has(key)) absentByDate.set(key, weight);
  });

  const absentDays = [...absentByDate.values()].reduce((total, weight) => total + weight, 0);

  // Approved PAID leave, capped at the one day a month §11.7 allows. The cap is
  // applied here as well as at approval time: a report that trusted the data to
  // already obey the rule would silently misreport if a second day ever got in.
  const approvedPaidDays = leaves
    .filter((leave) => leave.status === "approved" && leave.type === "paid")
    .reduce(
      (total, leave) => total + (leave.isHalfDay ? HALF : leaveDateKeys(leave, year, month).length),
      0
    );

  const paidLeave = Math.min(1, approvedPaidDays);

  // Everything beyond the paid allowance is unpaid.
  const unpaidLeave = Math.max(0, absentDays - paidLeave);

  // The surcharge only — the day itself is already inside `absentDays` above.
  // Kept as its own figure so the row can say exactly how many days were
  // doubled, rather than leaving a deduction that silently disagrees with the
  // day count beside it.
  const doubleDeductionDays = [...unapprovedByDate.values()].reduce(
    (total, weight) => total + weight,
    0
  );

  const deductibleDays = unpaidLeave + doubleDeductionDays;

  // baseSalary unset is NOT zero. A report showing "Net Payable ₹0" reads as a
  // real figure — someone earned nothing this month — when it actually means
  // "nobody has recorded what this person is paid". Null propagates so the UI
  // can render an em dash.
  const hasSalary = typeof user.baseSalary === "number" && user.baseSalary > 0;
  const rate = hasSalary ? perDayRate(user.baseSalary, year, month) : null;
  const deduction = hasSalary ? Math.round(deductibleDays * rate) : null;

  return {
    employeeId: String(user._id),
    name: user.name,
    baseSalary: hasSalary ? user.baseSalary : null,
    calendarDays,
    presentDays,
    absentDays,
    paidLeave,
    unpaidLeave,
    doubleDeductionDays,
    deduction,
    netPayable: hasSalary ? user.baseSalary - deduction : null,
  };
}

/**
 * The individual dates a leave covers INSIDE the requested month.
 *
 * Returns keys rather than a count so a date can be reconciled against an
 * Attendance record for the same day — a count alone cannot tell you whether
 * the two lists are describing the same day or two different ones.
 */
function leaveDateKeys(leave, year, month) {
  const { start, end } = monthBounds(year, month);
  const from = new Date(Math.max(new Date(leave.startDate).getTime(), start.getTime()));
  const to = new Date(Math.min(new Date(leave.endDate).getTime(), end.getTime() - 1));

  if (to < from) {
    return [];
  }

  const keys = [];
  const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate());

  while (cursor <= to) {
    keys.push(dateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return keys;
}

/**
 * One row per ACTIVE employee, including those with no attendance at all that
 * month — an employee missing from the report reads as "no data", when what it
 * actually means is "nobody recorded anything", and those are different.
 */
export async function buildMonthlyReport({ year, month }) {
  const { start, end } = monthBounds(year, month);

  const employees = await User.find({ isActive: true, role: { $ne: "customer" } })
    .select("+baseSalary")
    .sort({ name: 1 });

  const employeeIds = employees.map((employee) => employee._id);

  const [attendance, leaves] = await Promise.all([
    Attendance.find({ employeeId: { $in: employeeIds }, date: { $gte: start, $lt: end } }),
    Leave.find({ employeeId: { $in: employeeIds }, startDate: { $lt: end }, endDate: { $gte: start } }),
  ]);

  const attendanceByEmployee = new Map();
  attendance.forEach((record) => {
    const key = String(record.employeeId);
    attendanceByEmployee.set(key, [...(attendanceByEmployee.get(key) || []), record]);
  });

  const leavesByEmployee = new Map();
  leaves.forEach((leave) => {
    const key = String(leave.employeeId);
    leavesByEmployee.set(key, [...(leavesByEmployee.get(key) || []), leave]);
  });

  return employees.map((user) =>
    computeEmployeeMonth({
      user,
      attendance: attendanceByEmployee.get(String(user._id)) || [],
      leaves: leavesByEmployee.get(String(user._id)) || [],
      year,
      month,
    })
  );
}

export default buildMonthlyReport;
