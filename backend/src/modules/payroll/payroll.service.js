import ApiError from "../../utils/ApiError.js";
import { can } from "../../helpers/permission.helper.js";
import { generatePdfReport } from "../../services/report.service.js";
import { env } from "../../config/env.js";
import Payroll from "./payroll.model.js";
import User from "../user/user.model.js";
import Attendance from "../attendance/attendance.model.js";
import Leave from "../leave/leave.model.js";
import TravelLog from "../transport/travelLog.model.js";
import {
  computeEmployeeMonth,
  leaveYearStart,
} from "../../services/salaryCalculation.service.js";

/**
 * Entry point for both `POST /payroll/run` shapes (§7.7): a specific
 * `employeeId` runs (and re-run-guards) just that one employee; omitting it
 * runs every active employee for the month, per the task's own instruction
 * ("what POST /payroll/run without a specific employeeId does"). `employeeId`
 * as a run-time filter isn't in §7.7's literal endpoint list — a stated
 * addition, the same treatment as `mileageReimbursement` on the model.
 *
 * Route-level `requireAdmin` (or a direct call from the monthly cron, which
 * bypasses HTTP/auth entirely — the same cross-module direct-call pattern
 * already used elsewhere, e.g. attendance→travelLog) is what makes this
 * "admin-only"; nothing re-checks that here, the same reasoning
 * `markUnapprovedAbsence` already relies on its route's `requireAdmin`.
 */
export async function runPayroll({ employeeId, month, year, regenerate }) {
  const monthNumber = Number(month);
  const yearNumber = Number(year);

  if (employeeId) {
    return runPayrollForEmployee(employeeId, monthNumber, yearNumber, Boolean(regenerate));
  }

  return runPayrollBulk(monthNumber, yearNumber, Boolean(regenerate));
}

/**
 * Rejects outright (409) if this employee/month/year already has a Payroll
 * record, unless `regenerate` is true — the "admin-only override" the task
 * asked for a judgment call on; the exact shape chosen is a `regenerate=true`
 * query flag on the same run endpoint, not a separate route.
 */
async function runPayrollForEmployee(employeeId, month, year, regenerate) {
  const employee = await User.findById(employeeId).select("+baseSalary");

  if (!employee) {
    throw new ApiError(404, "Employee not found");
  }

  ensureHasBaseSalary(employee);

  const existing = await Payroll.findOne({ employeeId, month, year });

  if (existing && !regenerate) {
    throw new ApiError(
      409,
      `Payroll for this employee has already been generated for ${month}/${year}. Pass regenerate=true to recompute it.`
    );
  }

  const fields = await computePayrollFields(employee, month, year);

  if (existing) {
    Object.assign(existing, fields);
    await existing.save();
    return existing;
  }

  return Payroll.create({ employeeId, month, year, ...fields });
}

/**
 * Bulk run for all active employees (what the monthly cron calls, and what
 * `POST /payroll/run` without an `employeeId` does). Unlike the single-
 * employee path, an already-generated employee/month is silently SKIPPED
 * rather than thrown on — a monthly cron that fires twice by accident (or a
 * client retry) must stay idempotent, not error on every employee.
 * `regenerate=true` overrides this the same way it does for a single run.
 * Employees with no `baseSalary` set (including every `admin` account, which
 * never has one) are skipped too, not errored — payroll silently doesn't run
 * for them until an admin sets one, which is expected, not a bug.
 */
async function runPayrollBulk(month, year, regenerate) {
  const employees = await User.find({ isActive: true }).select("+baseSalary");
  const generated = [];
  const skipped = [];

  for (const employee of employees) {
    if (employee.baseSalary === null || employee.baseSalary === undefined) {
      skipped.push({ employeeId: employee._id, reason: "no baseSalary set" });
      continue;
    }

    const existing = await Payroll.findOne({ employeeId: employee._id, month, year });

    if (existing && !regenerate) {
      skipped.push({ employeeId: employee._id, reason: "already generated" });
      continue;
    }

    const fields = await computePayrollFields(employee, month, year);

    if (existing) {
      Object.assign(existing, fields);
      await existing.save();
      generated.push(existing);
    } else {
      generated.push(await Payroll.create({ employeeId: employee._id, month, year, ...fields }));
    }
  }

  return { generated, skipped };
}

function ensureHasBaseSalary(employee) {
  if (employee.baseSalary === null || employee.baseSalary === undefined) {
    throw new ApiError(
      400,
      "This employee has no baseSalary set — an admin must set it (PATCH /users/:id) before payroll can be run"
    );
  }
}

/**
 * Every figure comes from the SHARED calculator (§7.53, 2026-08-12).
 *
 * This function used to do its own arithmetic and it is gone, not flagged off.
 * `salaryCalculation.service.js` is owned by the leave report (§7.47) and
 * consumed here, so the two cannot drift into a disputed payslip. What remains
 * here is fetching — the inputs the calculator needs — plus the Payroll-only
 * mileage, which is passed IN so the addition still happens in the calculator.
 */
async function computePayrollFields(employee, month, year) {
  const { start, end } = resolveMonthRange(month, year);
  const yearStart = leaveYearStart(year, month);

  // Attendance is fetched for `workingHoursTotal` ONLY, which is reported and
  // never priced. Leave spans the leave year to date because the calculator's
  // balance figures need what was spent before this month.
  const [attendance, leaves, approvedTravelLogs] = await Promise.all([
    Attendance.find({ employeeId: employee._id, date: { $gte: start, $lt: end } }),
    Leave.find({
      employeeId: employee._id,
      startDate: { $lt: end },
      endDate: { $gte: yearStart },
    }),
    TravelLog.find({
      employeeId: employee._id,
      status: "approved",
      date: { $gte: start, $lt: end },
    }).select("distanceKm"),
  ]);

  const totalApprovedKm = approvedTravelLogs.reduce(
    (total, log) => total + (log.distanceKm || 0),
    0
  );

  const computed = computeEmployeeMonth({
    user: employee,
    attendance,
    leaves,
    year,
    month,
    reimbursements: totalApprovedKm * env.mileageRatePerKm,
  });

  return {
    daysInMonth: computed.calendarDays,
    presentDays: computed.presentDays,
    paidLeaveDays: computed.paidLeave,
    // The calculator returns the surcharge separately so a payslip can mark it;
    // the model stores the total number of days actually charged.
    unpaidDeductionDays: computed.unpaidLeave + computed.doubleDeductionDays,
    doubleDeductionDays: computed.doubleDeductionDays,
    workingHoursTotal: computed.workingHoursTotal,
    grossAmount: computed.grossAmount,
    deduction: computed.deduction,
    netAmount: computed.netPayable,
    mileageReimbursement: computed.reimbursements,
    generatedAt: new Date(),
    paidOn: new Date(year, month, 1),
  };
}

function resolveMonthRange(month, year) {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);

  return { start, end };
}

/**
 * `scope=own` (default) needs `payroll.view`; `scope=all` needs
 * `payroll.run` — reused as the "administrative access" tier since §5's
 * matrix only lists `payroll.view`/`run` (no separate `view_all`), and only
 * admin holds `run` anyway. Unlike Leave/TravelLog's three-tier shape,
 * Payroll has no `team` scope at all (§7.7) — Manager gets no payroll grant
 * whatsoever, a deliberate divergence from every other workforce module:
 * salary data is more sensitive than attendance/leave/travel data.
 */
export async function listPayroll({ scope, month }, requestingUser) {
  const resolvedScope = scope || "own";
  const filter = {};

  if (resolvedScope === "all") {
    if (!can(requestingUser, "payroll", "run")) {
      throw new ApiError(403, "You do not have permission to view all payroll records");
    }
  } else {
    if (!can(requestingUser, "payroll", "view")) {
      throw new ApiError(403, "You do not have permission to view your payroll records");
    }

    filter.employeeId = requestingUser._id;
  }

  if (month) {
    const [yearNumber, monthNumber] = month.split("-").map(Number);
    filter.year = yearNumber;
    filter.month = monthNumber;
  }

  return Payroll.find(filter).sort({ year: -1, month: -1 });
}

/**
 * Mirrors user.service.js#getUserById's exact shape: broad grant
 * (`payroll.run`, admin-only in practice) bypasses to any record; otherwise
 * self-scoped and gated behind `payroll.view`. 404-not-403 for anything else
 * — matches the Leads/Location/User precedent of not confirming whether an
 * out-of-scope record even exists.
 */
export async function getPayslip(payrollId, requestingUser) {
  const payroll = await Payroll.findById(payrollId).populate("employeeId", "name email");

  if (!payroll) {
    throw new ApiError(404, "Payroll record not found");
  }

  if (can(requestingUser, "payroll", "run")) {
    return payroll;
  }

  const isSelf = String(payroll.employeeId._id) === String(requestingUser._id);

  if (isSelf && can(requestingUser, "payroll", "view")) {
    return payroll;
  }

  throw new ApiError(404, "Payroll record not found");
}

/**
 * PDF only (§7.7 — `GET /payroll/:id/payslip?format=pdf`, no xlsx option
 * unlike every other module's report endpoint). Reuses
 * `src/services/report.service.js`'s generic PDF table builder — a payslip
 * is a single record, not a multi-row list, so it's rendered as a two-column
 * Field/Value table (2026-08-04 — previously a plain list of text lines;
 * `generatePdfReport`'s signature changed to a real `columns`/`rows` table
 * for every caller as part of §7.11's Reports PDF formatting fix, and a
 * key/value table is the natural fit for a single-record document under
 * that same table primitive, rather than a special-cased text layout).
 */
export async function generatePayslipPdf(payrollId, requestingUser) {
  const payroll = await getPayslip(payrollId, requestingUser);

  return generatePdfReport({
    title: `Payslip — ${payroll.employeeId.name}`,
    subtitle: `${payroll.month}/${payroll.year}`,
    columns: [
      { header: "Field", key: "field", width: 1.4 },
      { header: "Value", key: "value", width: 1 },
    ],
    rows: [
      { field: "Employee", value: payroll.employeeId.name },
      { field: "Period", value: `${payroll.month}/${payroll.year}` },
      { field: "Days in month", value: payroll.daysInMonth },
      { field: "Present days", value: payroll.presentDays },
      { field: "Paid leave days", value: payroll.paidLeaveDays },
      { field: "Unpaid deduction days", value: payroll.unpaidDeductionDays },
      { field: "Working hours total", value: payroll.workingHoursTotal },
      { field: "Mileage reimbursement", value: payroll.mileageReimbursement },
      { field: "Gross amount", value: payroll.grossAmount },
      { field: "Net amount", value: payroll.netAmount },
      { field: "Paid on", value: payroll.paidOn },
    ],
  });
}
