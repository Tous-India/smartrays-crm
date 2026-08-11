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
 * The annual paid-leave entitlement (§7.49, 2026-08-11).
 *
 * This does NOT change any approval rule. `PAID_LEAVE_MONTHLY_LIMIT = 1` in
 * `leave.service.js` is still the only thing that decides whether a request can
 * be approved, and §11.7 still holds: one paid day per calendar month, no
 * carry-forward, no accumulated balance anyone can spend in bulk. Twelve is
 * simply what one-a-month adds up to over a year, so "Balance" answers "how
 * much of the annual allowance is left", not "how many days may I take now".
 */
export const ANNUAL_PAID_LEAVE_DAYS = 12;

/**
 * THE leave-year boundary — the single place it is defined.
 *
 * Calendar year today: January–December. Switching the business to a financial
 * year (April–March) is a one-line change to this constant; nothing else in
 * this file, the endpoint, or the UI encodes a year boundary, which is the
 * whole reason it lives here as a named constant rather than as a `new
 * Date(year, 0, 1)` scattered through the balance maths.
 */
export const LEAVE_YEAR_START_MONTH = 1;

/**
 * The first day of the leave year that the given 1-based month falls inside.
 *
 * Written generally rather than special-cased to January so the financial-year
 * switch above really is one line: with a start month of 4, March 2026 belongs
 * to the year that began in April 2025.
 */
export function leaveYearStart(year, month) {
  const startYear = month >= LEAVE_YEAR_START_MONTH ? year : year - 1;
  const start = new Date(startYear, LEAVE_YEAR_START_MONTH - 1, 1);
  start.setHours(0, 0, 0, 0);

  return start;
}

/** Human-readable label for the leave year, for the UI's subheading. */
export function leaveYearLabel(year, month) {
  const start = leaveYearStart(year, month);

  if (LEAVE_YEAR_START_MONTH === 1) {
    return String(start.getFullYear());
  }

  return `${start.getFullYear()}-${String((start.getFullYear() + 1) % 100).padStart(2, "0")}`;
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
  const { start: monthStart, end: monthEnd } = monthBounds(year, month);

  const approvedPaidDays = leaves
    .filter(isApprovedPaidLeave)
    .reduce((total, leave) => total + paidDaysBetween(leave, monthStart, monthEnd), 0);

  const paidLeave = Math.min(1, approvedPaidDays);

  // §7.49 — the annual balance. Derived entirely from year-to-date approved
  // paid leave; nothing is stored, so there is no balance field to drift out of
  // sync with the leave records themselves.
  //
  // `leaves` may span the whole leave year (that is what `buildMonthlyReport`
  // now fetches). Everything above is month-scoped by its own date clipping, so
  // widening the input changed no existing figure.
  const yearStart = leaveYearStart(year, month);

  const paidLeaveBeforeThisMonth = leaves
    .filter(isApprovedPaidLeave)
    .reduce((total, leave) => total + paidDaysBetween(leave, yearStart, monthStart), 0);

  const oldBalance = ANNUAL_PAID_LEAVE_DAYS - paidLeaveBeforeThisMonth;
  // Always 1: the entitlement accrues at one day per month whether or not it is
  // used. It is a column rather than a constant in the UI so the arithmetic on
  // the row reads as arithmetic.
  const monthCredit = 1;
  const balance = ANNUAL_PAID_LEAVE_DAYS - (paidLeaveBeforeThisMonth + paidLeave);

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
    leaveYear: leaveYearLabel(year, month),
    oldBalance,
    monthCredit,
    balance,
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
 * The individual dates a leave covers inside `[from, to)`.
 *
 * Returns keys rather than a count so a date can be reconciled against an
 * Attendance record for the same day — a count alone cannot tell you whether
 * the two lists are describing the same day or two different ones.
 */
function dateKeysBetween(leave, from, to) {
  const start = new Date(Math.max(new Date(leave.startDate).getTime(), from.getTime()));
  const end = new Date(Math.min(new Date(leave.endDate).getTime(), to.getTime() - 1));

  if (end < start) {
    return [];
  }

  const keys = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());

  while (cursor <= end) {
    keys.push(dateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return keys;
}

/** The dates a leave covers inside the requested month. */
function leaveDateKeys(leave, year, month) {
  const { start, end } = monthBounds(year, month);

  return dateKeysBetween(leave, start, end);
}

/**
 * How many paid days a leave contributes within `[from, to)`.
 *
 * A half-day leave is 0.5 only if it actually falls inside the window — the
 * earlier `isHalfDay ? 0.5 : count` shorthand returned 0.5 for a half day
 * entirely OUTSIDE the range, which the month-scoped call never exposed but
 * the year-to-date call immediately would.
 */
function paidDaysBetween(leave, from, to) {
  const keys = dateKeysBetween(leave, from, to);

  if (leave.isHalfDay) {
    return keys.length > 0 ? HALF : 0;
  }

  return keys.length;
}

/** Approved paid leave only — pending and rejected requests are not spent. */
function isApprovedPaidLeave(leave) {
  return leave.status === "approved" && leave.type === "paid";
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

  // Attendance stays month-scoped; LEAVE is fetched for the whole leave year to
  // date (§7.49), because the balance columns need what was spent in the months
  // BEFORE this one. Still one query per collection, not one per employee —
  // the widening is in the date range, not in the number of round trips.
  const yearStart = leaveYearStart(year, month);

  const [attendance, leaves] = await Promise.all([
    Attendance.find({ employeeId: { $in: employeeIds }, date: { $gte: start, $lt: end } }),
    Leave.find({
      employeeId: { $in: employeeIds },
      startDate: { $lt: end },
      endDate: { $gte: yearStart },
    }),
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
