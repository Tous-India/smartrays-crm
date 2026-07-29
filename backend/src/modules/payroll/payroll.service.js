import ApiError from "../../utils/ApiError.js";
import { can } from "../../helpers/permission.helper.js";
import { generatePdfReport } from "../../services/report.service.js";
import { env } from "../../config/env.js";
import Payroll from "./payroll.model.js";
import User from "../user/user.model.js";
import Attendance from "../attendance/attendance.model.js";
import Leave from "../leave/leave.model.js";
import { computeLeaveDays } from "../leave/leave.service.js";
import TravelLog from "../transport/travelLog.model.js";

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
 * Implements §7.7's formulas exactly:
 * - presentDays: Attendance `present`/`half_day` records this month.
 * - paidLeaveDays: approved `paid` Leave this month (capped at 1 in practice
 *   by leave.service.js#approveLeave's own monthly quota, §11.7 — this just
 *   sums whatever's actually approved, it doesn't re-enforce the cap here).
 * - unpaidDeductionDays: approved `unpaid` Leave days, plus approved
 *   `unapproved_absence` days doubled — driven by the existing
 *   `isDoubleDeduction` flag already on the Leave model, not a duplicated
 *   type check. Both day counts go through `leave.service.js#computeLeaveDays`
 *   (added for half-day support) rather than a second, local day-counting
 *   function — an `isHalfDay` leave correctly contributes 0.5 here, the same
 *   value the monthly paid-leave quota check already uses it for.
 * - mileageReimbursement: `status: "approved"` TravelLog distanceKm this
 *   month × `MILEAGE_RATE_PER_KM` (§11.4, resolved) — `pending`/`rejected`
 *   entries never count.
 * - paidOn: the 1st of the month after the payroll month.
 *
 * Leave records are attributed to the month containing their `startDate`
 * (mirrors leave.service.js's own monthly-quota window) — a multi-day leave
 * that spans a month boundary is counted entirely in its start month. Stated
 * simplification, not an oversight: the source Leave data for this app is
 * always short (paid leave is capped at 1 day; unpaid/absence spans are rare
 * and short in practice), so a split-across-months day count isn't worth the
 * added complexity for v1.
 */
async function computePayrollFields(employee, month, year) {
  const { start, end } = resolveMonthRange(month, year);
  const daysInMonth = new Date(year, month, 0).getDate();

  const presentDays = await Attendance.countDocuments({
    employeeId: employee._id,
    date: { $gte: start, $lt: end },
    status: { $in: ["present", "half_day"] },
  });

  const paidLeaves = await Leave.find({
    employeeId: employee._id,
    type: "paid",
    status: "approved",
    startDate: { $gte: start, $lt: end },
  });
  const paidLeaveDays = paidLeaves.reduce((total, leave) => total + computeLeaveDays(leave), 0);

  const deductingLeaves = await Leave.find({
    employeeId: employee._id,
    type: { $in: ["unpaid", "unapproved_absence"] },
    status: "approved",
    startDate: { $gte: start, $lt: end },
  });
  const unpaidDeductionDays = deductingLeaves.reduce((total, leave) => {
    const days = computeLeaveDays(leave);
    return total + (leave.isDoubleDeduction ? days * 2 : days);
  }, 0);

  const attendanceRecords = await Attendance.find({
    employeeId: employee._id,
    date: { $gte: start, $lt: end },
  }).select("workingHours");
  const workingHoursTotal = attendanceRecords.reduce(
    (total, record) => total + (record.workingHours || 0),
    0
  );

  const approvedTravelLogs = await TravelLog.find({
    employeeId: employee._id,
    status: "approved",
    date: { $gte: start, $lt: end },
  }).select("distanceKm");
  const totalApprovedKm = approvedTravelLogs.reduce(
    (total, log) => total + (log.distanceKm || 0),
    0
  );
  const mileageReimbursement = totalApprovedKm * env.mileageRatePerKm;

  const dailyRate = employee.baseSalary / daysInMonth;
  const grossAmount = dailyRate * (presentDays + paidLeaveDays);
  const netAmount = grossAmount - unpaidDeductionDays * dailyRate + mileageReimbursement;

  return {
    daysInMonth,
    presentDays,
    paidLeaveDays,
    unpaidDeductionDays,
    workingHoursTotal,
    grossAmount,
    netAmount,
    mileageReimbursement,
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
 * `src/services/report.service.js`'s generic PDF builder for a single-record
 * "report" rather than writing new PDF-generation code.
 */
export async function generatePayslipPdf(payrollId, requestingUser) {
  const payroll = await getPayslip(payrollId, requestingUser);

  return generatePdfReport({
    title: `Payslip — ${payroll.employeeId.name} — ${payroll.month}/${payroll.year}`,
    rows: [payroll],
    formatRow: (record) =>
      [
        `Employee: ${record.employeeId.name}`,
        `Period: ${record.month}/${record.year}`,
        `Days in month: ${record.daysInMonth}`,
        `Present days: ${record.presentDays}`,
        `Paid leave days: ${record.paidLeaveDays}`,
        `Unpaid deduction days: ${record.unpaidDeductionDays}`,
        `Working hours total: ${record.workingHoursTotal.toFixed(2)}`,
        `Mileage reimbursement: ${record.mileageReimbursement.toFixed(2)}`,
        `Gross amount: ${record.grossAmount.toFixed(2)}`,
        `Net amount: ${record.netAmount.toFixed(2)}`,
        `Paid on: ${record.paidOn.toDateString()}`,
      ].join("\n"),
  });
}
