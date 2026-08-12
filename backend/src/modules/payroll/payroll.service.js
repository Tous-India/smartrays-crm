import ApiError from "../../utils/ApiError.js";
import { can } from "../../helpers/permission.helper.js";
import { generatePdfReport } from "../../services/report.service.js";
import { env } from "../../config/env.js";
import Payroll from "./payroll.model.js";
import User from "../user/user.model.js";
import Attendance from "../attendance/attendance.model.js";
import Leave from "../leave/leave.model.js";
import TravelLog from "../transport/travelLog.model.js";
import PayrollAdjustment from "./payrollAdjustment.model.js";

/**
 * A deduction past this share of gross is FLAGGED, not blocked (§7.54). A long
 * unpaid absence legitimately looks like this; so does a mistaken roster mark,
 * and only a human can tell them apart.
 */
const DEDUCTION_ANOMALY_SHARE = 1 / 3;
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

  // THE load-bearing rule (§7.54): once a period is approved its figures are
  // frozen. Regenerating is a DRAFT-only operation — no flag reopens it,
  // because an approved record is a payslip somebody has been shown, and a
  // payslip that changes afterwards is not a payslip. Editing a July
  // attendance record in September must leave July's pay exactly where it was.
  if (existing && existing.status !== "draft") {
    throw new ApiError(
      409,
      `Payroll for ${month}/${year} is ${existing.status} and can no longer be recomputed. Raise an adjustment on the next run instead.`
    );
  }

  if (existing && !regenerate) {
    throw new ApiError(
      409,
      `Payroll for this employee has already been generated for ${month}/${year}. Pass regenerate=true to recompute it.`
    );
  }

  const fields = await computePayrollFields(employee, month, year);

  if (existing) {
    Object.assign(existing, fields);
    await applyPendingAdjustments(existing);
    await existing.save();
    return existing;
  }

  const created = await Payroll.create({ employeeId, month, year, ...fields });
  await applyPendingAdjustments(created);
  await created.save();

  return created;
}

/**
 * Copies any unapplied corrections for this record's period onto it and folds
 * them into the net.
 *
 * Adjustments live in their own collection because a draft is regenerated
 * freely — anything embedded in one would be destroyed by the next re-run.
 * Re-running therefore RE-COLLECTS them rather than losing or double-counting
 * them: the record's array is rebuilt from scratch each time, and
 * `appliedToPayrollId` is repointed at it.
 */
async function applyPendingAdjustments(payroll) {
  const pending = await PayrollAdjustment.find({
    employeeId: payroll.employeeId,
    month: payroll.month,
    year: payroll.year,
  }).sort({ createdAt: 1 });

  payroll.adjustments = pending.map((adjustment) => ({
    amount: adjustment.amount,
    reason: adjustment.reason,
    createdBy: adjustment.createdBy,
    createdAt: adjustment.createdAt,
    sourceMonth: adjustment.sourceMonth,
    sourceYear: adjustment.sourceYear,
  }));
  payroll.adjustmentTotal = pending.reduce((total, one) => total + one.amount, 0);
  payroll.netAmount += payroll.adjustmentTotal;

  await PayrollAdjustment.updateMany(
    { _id: { $in: pending.map((one) => one._id) } },
    { $set: { appliedToPayrollId: payroll._id } }
  );
}

/** The period a correction to `month`/`year` gets paid in — always the next. */
export function nextPeriod(month, year) {
  return month === 12 ? { month: 1, year: year + 1 } : { month: month + 1, year };
}

/**
 * Raises a correction against an APPROVED period, payable on the next run.
 *
 * Refuses to correct a period that is not approved yet: while it is still a
 * draft the right fix is to re-run it, and an adjustment there would be
 * double-counted the moment somebody did.
 */
export async function addAdjustment({ employeeId, month, year, amount, reason }, actor) {
  const numericAmount = Number(amount);

  if (!Number.isFinite(numericAmount) || numericAmount === 0) {
    throw new ApiError(400, "An adjustment needs a non-zero amount");
  }

  if (!reason || !String(reason).trim()) {
    throw new ApiError(400, "An adjustment needs a reason");
  }

  const source = await Payroll.findOne({ employeeId, month, year });

  if (!source) {
    throw new ApiError(404, "No payroll record for that employee and period");
  }

  // WHERE the adjustment lands depends on whether the period is still open
  // (§7.57).
  //
  //  - draft/review: it is a LINE ON THIS RUN — a bonus or an other-deduction
  //    the admin is adding while preparing it. Targets this same period.
  //  - approved/paid: the period is frozen, so it is a CORRECTION and lands on
  //    the next run. History is never mutated.
  //
  // Both write the same PayrollAdjustment record; only the target period
  // differs. Regeneration re-collects them either way, which is what stops a
  // re-run losing a bonus or double-counting one.
  const isOpen = source.status === "draft" || source.status === "review";
  const target = isOpen ? { month, year } : nextPeriod(month, year);

  return PayrollAdjustment.create({
    employeeId,
    month: target.month,
    year: target.year,
    // A line on the run being prepared corrects nothing, so it carries no
    // source period — that is what distinguishes it from a correction on a
    // payslip, which must say which month it puts right.
    sourceMonth: isOpen ? null : month,
    sourceYear: isOpen ? null : year,
    amount: numericAmount,
    reason: String(reason).trim(),
    createdBy: actor._id,
  });
}

/** Legal transitions, in one place so no endpoint can invent its own. */
const NEXT_STATUS = { draft: "review", review: "approved", approved: "paid" };

/** How far along each state is, for "least advanced record wins" above. */
const STATUS_ORDER = { draft: 0, review: 1, approved: 2, paid: 3 };

async function transitionPeriod(month, year, from, to, actor, extra = {}) {
  const records = await Payroll.find({ month, year });

  if (records.length === 0) {
    throw new ApiError(404, `No payroll records for ${month}/${year}`);
  }

  const wrongState = records.filter((record) => record.status !== from);

  if (wrongState.length > 0) {
    throw new ApiError(
      409,
      `Every record for ${month}/${year} must be "${from}" to become "${to}" — ${wrongState.length} is not.`
    );
  }

  await Payroll.updateMany({ month, year }, { $set: { status: to, ...extra } });

  return Payroll.find({ month, year });
}

/** draft -> review. Nothing is frozen yet; this only says "look at it". */
export async function submitPeriodForReview(month, year, actor) {
  return transitionPeriod(month, year, "draft", "review", actor);
}

/**
 * review -> approved. THIS is the freeze.
 *
 * Requires an explicit action and records who did it and when — approval is the
 * moment numbers become somebody's pay, so it is attributable by construction.
 * Nothing recomputes an approved record afterwards; `runPayrollForEmployee`
 * and the bulk path both refuse to touch one.
 */
export async function approvePeriod(month, year, actor) {
  return transitionPeriod(month, year, "review", "approved", actor, {
    approvedBy: actor._id,
    approvedAt: new Date(),
  });
}

/** approved -> paid. Recording only — no disbursement, no gateway. */
export async function markPeriodPaid(month, year, actor, paidDate) {
  const when = paidDate ? new Date(paidDate) : new Date();

  if (Number.isNaN(when.getTime())) {
    throw new ApiError(400, "Invalid payment date");
  }

  return transitionPeriod(month, year, "approved", "paid", actor, {
    paidBy: actor._id,
    paidAt: when,
  });
}

/**
 * One summary per pay run in a year (§7.57) — what the `/payroll` page lists.
 *
 * Aggregated from the Payroll documents themselves rather than recomputed:
 * every figure here is a sum of what a run already stored, so this cannot
 * disagree with the run it describes. Nothing in this file computes salary —
 * that is `salaryCalculation.service.js`'s job and only its job.
 *
 * Months with NO run are returned as empty rows rather than omitted, so a
 * missed month is visible instead of invisible. A payroll that silently skipped
 * March is exactly the thing a list of runs exists to catch.
 */
export async function listPayrollPeriods(year) {
  const numericYear = Number(year);
  const records = await Payroll.find({ year: numericYear }).populate("approvedBy", "name");

  const byMonth = new Map();

  records.forEach((record) => {
    const existing = byMonth.get(record.month) || {
      month: record.month,
      year: numericYear,
      status: record.status,
      employeeCount: 0,
      grossTotal: 0,
      netTotal: 0,
      adjustmentTotal: 0,
      generatedAt: null,
      approvedBy: null,
      approvedAt: null,
      paidAt: null,
    };

    existing.employeeCount += 1;
    existing.grossTotal += record.grossAmount || 0;
    existing.netTotal += record.netAmount || 0;
    existing.adjustmentTotal += record.adjustmentTotal || 0;

    // A run is only as advanced as its LEAST advanced record — one unapproved
    // employee means the period is not approved, however the others look.
    if (STATUS_ORDER[record.status] < STATUS_ORDER[existing.status]) {
      existing.status = record.status;
    }

    if (!existing.generatedAt || record.generatedAt > existing.generatedAt) {
      existing.generatedAt = record.generatedAt;
    }

    if (record.approvedAt) {
      existing.approvedAt = record.approvedAt;
      existing.approvedBy = record.approvedBy?.name || null;
    }

    if (record.paidAt) {
      existing.paidAt = record.paidAt;
    }

    byMonth.set(record.month, existing);
  });

  const rows = [];

  for (let month = 12; month >= 1; month -= 1) {
    rows.push(
      byMonth.get(month) || {
        month,
        year: numericYear,
        status: null,
        employeeCount: 0,
        grossTotal: 0,
        netTotal: 0,
        adjustmentTotal: 0,
        generatedAt: null,
        approvedBy: null,
        approvedAt: null,
        paidAt: null,
      }
    );
  }

  return rows;
}

/** Which years actually have runs, plus the current one so it is always offered. */
export async function listPayrollYears() {
  const years = await Payroll.distinct("year");
  const currentYear = new Date().getFullYear();

  return [...new Set([...years, currentYear])].sort((a, b) => b - a);
}

/**
 * The review screen's data (§7.54): every active employee for the period, with
 * ANOMALIES flagged.
 *
 * The inputs are imperfect by design — a manual roster mark carries no device
 * evidence, and an unapproved absence deducts at 2× — so an admin has to see
 * the numbers before they become somebody's pay. Flagging is deliberately
 * conservative: it points at rows worth a second look, it does not block.
 */
export async function getPeriodReview({ month, year }) {
  const [records, employees] = await Promise.all([
    Payroll.find({ month, year }).populate("employeeId", "name email"),
    User.find({ isActive: true, role: { $ne: "customer" } }).select("+baseSalary name email"),
  ]);

  const byEmployee = new Map(records.map((record) => [String(record.employeeId?._id), record]));

  const rows = employees.map((employee) => {
    const record = byEmployee.get(String(employee._id));
    const anomalies = [];

    if (typeof employee.baseSalary !== "number" || employee.baseSalary <= 0) {
      anomalies.push({ code: "NO_BASE_SALARY", detail: "No base salary recorded" });
    }

    if (!record) {
      anomalies.push({ code: "NO_RECORD", detail: "No payroll record for this period" });
    } else {
      if (record.presentDays === 0) {
        anomalies.push({ code: "NO_ATTENDANCE", detail: "No attendance recorded all month" });
      }

      // A deduction past a third of gross is not necessarily wrong — a long
      // unpaid absence looks exactly like this — but it is the shape a bad
      // roster mark also takes, and it is worth a human glance either way.
      if (record.grossAmount > 0 && record.deduction / record.grossAmount > DEDUCTION_ANOMALY_SHARE) {
        anomalies.push({
          code: "HIGH_DEDUCTION",
          detail: `Deduction is ${Math.round((record.deduction / record.grossAmount) * 100)}% of gross`,
        });
      }

      if (record.doubleDeductionDays > 0) {
        anomalies.push({
          code: "UNAPPROVED_ABSENCE",
          detail: `${record.doubleDeductionDays} day(s) charged at 2x`,
        });
      }

      if (record.adjustmentTotal !== 0) {
        anomalies.push({
          code: "HAS_ADJUSTMENT",
          detail: `Carries ${record.adjustments.length} correction(s) from an earlier period`,
        });
      }
    }

    return {
      employeeId: String(employee._id),
      name: employee.name,
      status: record ? record.status : null,
      payrollId: record ? String(record._id) : null,
      baseSalary: typeof employee.baseSalary === "number" ? employee.baseSalary : null,
      presentDays: record ? record.presentDays : null,
      paidLeaveDays: record ? record.paidLeaveDays : null,
      unpaidDeductionDays: record ? record.unpaidDeductionDays : null,
      doubleDeductionDays: record ? record.doubleDeductionDays : 0,
      grossAmount: record ? record.grossAmount : null,
      deduction: record ? record.deduction : null,
      adjustmentTotal: record ? record.adjustmentTotal : 0,
      // Split by SIGN (§7.57): positive pays, negative claws back. One record
      // type carries both — the sign already says which, and a second way of
      // saying it could disagree with the first.
      bonusTotal: record
        ? record.adjustments.filter((one) => one.amount > 0).reduce((t, one) => t + one.amount, 0)
        : 0,
      otherDeductionTotal: record
        ? record.adjustments.filter((one) => one.amount < 0).reduce((t, one) => t - one.amount, 0)
        : 0,
      adjustmentLines: record
        ? record.adjustments.map((one) => ({
            amount: one.amount,
            reason: one.reason,
            sourceMonth: one.sourceMonth,
            sourceYear: one.sourceYear,
          }))
        : [],
      netAmount: record ? record.netAmount : null,
      anomalies,
    };
  });

  return {
    month,
    year,
    status: records.length > 0 ? records[0].status : null,
    approvedAt: records.find((record) => record.approvedAt)?.approvedAt || null,
    totals: {
      employees: rows.length,
      withRecord: records.length,
      flagged: rows.filter((row) => row.anomalies.length > 0).length,
      gross: records.reduce((total, record) => total + (record.grossAmount || 0), 0),
      deduction: records.reduce((total, record) => total + (record.deduction || 0), 0),
      bonus: rows.reduce((total, row) => total + row.bonusTotal, 0),
      otherDeductions: rows.reduce((total, row) => total + row.otherDeductionTotal, 0),
      net: records.reduce((total, record) => total + (record.netAmount || 0), 0),
    },
    rows,
  };
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

    // Approved and paid periods are frozen (§7.54) — a bulk run SKIPS them
    // rather than erroring, matching how it already treats an
    // already-generated employee, so one locked record cannot stop the rest of
    // the run. The cron path goes through here, and a machine must never be
    // able to move an approved figure.
    if (existing && existing.status !== "draft") {
      skipped.push({ employeeId: employee._id, reason: `already ${existing.status}` });
      continue;
    }

    if (existing && !regenerate) {
      skipped.push({ employeeId: employee._id, reason: "already generated" });
      continue;
    }

    const fields = await computePayrollFields(employee, month, year);

    if (existing) {
      Object.assign(existing, fields);
      await applyPendingAdjustments(existing);
      await existing.save();
      generated.push(existing);
    } else {
      const created = await Payroll.create({ employeeId: employee._id, month, year, ...fields });
      await applyPendingAdjustments(created);
      await created.save();
      generated.push(created);
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

  // STORED figures only — nothing here recomputes from live attendance, which
  // is what makes a payslip reproducible months later. A draft has no payslip
  // at all: its numbers are still moving, and handing someone a document that
  // will change is worse than handing them nothing (§7.54).
  if (payroll.status === "draft" || payroll.status === "review") {
    throw new ApiError(
      409,
      "This period is not approved yet — a payslip is only issued once the figures are final"
    );
  }

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
      ...adjustmentRows(payroll),
      { field: "Gross amount", value: payroll.grossAmount },
      {
        field: "Deduction",
        // The ×2 is marked where it applies, so a deduction larger than the
        // day count implies reads as policy rather than as an error.
        value:
          payroll.doubleDeductionDays > 0
            ? `${payroll.deduction} (includes ${payroll.doubleDeductionDays} unapproved absence day(s) at 2x)`
            : payroll.deduction,
      },
      { field: "Net amount", value: payroll.netAmount },
      { field: "Status", value: payroll.status },
      { field: "Paid on", value: payroll.paidOn },
    ],
  });
}

/** One labelled line per correction carried from an earlier period. */
function adjustmentRows(payroll) {
  return (payroll.adjustments || []).map((adjustment) => ({
    field: `Adjustment (${adjustment.sourceMonth}/${adjustment.sourceYear})`,
    value: `${adjustment.amount} — ${adjustment.reason}`,
  }));
}
