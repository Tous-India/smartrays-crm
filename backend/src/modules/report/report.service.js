import ApiError from "../../utils/ApiError.js";
import { can } from "../../helpers/permission.helper.js";
import { generateExcelReport, generatePdfReport, excludeInactiveOrDeletedRefs } from "../../services/report.service.js";
import { generateAttendanceReport } from "../attendance/attendance.service.js";
import { generateTravelLogReport } from "../transport/travelLog.service.js";
import { listLeaves } from "../leave/leave.service.js";
import { listPayroll } from "../payroll/payroll.service.js";
import { listLeads } from "../lead/lead.service.js";
import { listCustomers } from "../customer/customer.service.js";
import Leave from "../leave/leave.model.js";
import Payroll from "../payroll/payroll.model.js";
import Lead from "../lead/lead.model.js";
import Customer from "../customer/customer.model.js";

/**
 * §7.11 — one dispatcher, six supported `module` values (the exact list
 * §7.11 names): each entry pairs a coarse access check (reusing `can()`
 * against that module's OWN existing permission actions — no new
 * `reports.generate` permission was invented) with a data-fetch step that
 * calls straight into that module's existing, already-scoped list/report
 * function. The dispatcher never runs a raw, unscoped query itself — a
 * manager requesting an `attendance` report gets exactly what
 * `getTeamAttendance`/`generateAttendanceReport` already resolve for them,
 * not a separate, parallel scoping implementation.
 *
 * `canAccess` is deliberately a coarse "can this role attempt a report from
 * this module AT ALL" gate, not the full scope resolution — for modules with
 * multiple scope tiers (attendance/transport/leave), any one qualifying
 * grant is enough to pass this gate, and the module's own data-fetcher
 * (which the dispatcher still calls) does the actual per-scope permission
 * check and may itself reject a *broader* scope than the caller holds (e.g.
 * `listPayroll` still 403s a `scope=all` request from someone who only has
 * `payroll.view`, not `payroll.run`).
 *
 * **Deleted/deactivated employees excluded from the output (2026-08-04)** —
 * every `generateBuffer` below calls `excludeInactiveOrDeletedRefs` right
 * after its own `populate()`, before building rows. Export-only: nothing
 * about deletion, scoping, or any other view changes — see
 * `excludeInactiveOrDeletedRefs`'s own docblock and backend/README.md's
 * Reports section for the full reasoning.
 */
const MODULE_HANDLERS = {
  attendance: {
    canAccess: (user) => can(user, "attendance", "view_team") || can(user, "attendance", "view_all"),
    generateBuffer: (filters, format, user) =>
      generateAttendanceReport({ from: filters.from, to: filters.to, format }, user),
  },
  transport: {
    canAccess: (user) => can(user, "travelLogs", "view_team") || can(user, "travelLogs", "view_all"),
    generateBuffer: (filters, format, user) =>
      generateTravelLogReport({ from: filters.from, to: filters.to, format }, user),
  },
  leave: {
    // Any held view tier at all — a "leave report" is just "your list of
    // visible leave data, in file form", so whichever scope(s) `listLeaves`
    // would already let this caller see is enough to attempt one.
    canAccess: (user) =>
      can(user, "leave", "view") || can(user, "leave", "view_team") || can(user, "leave", "view_all"),
    generateBuffer: async (filters, format, user) => {
      const records = await listLeaves(filters.scope, user);
      await Leave.populate(records, { path: "employeeId", select: "name isActive" });
      const rows = buildLeaveRows(excludeInactiveOrDeletedRefs(records, "employeeId"));

      return format === "pdf"
        ? generatePdfReport({
            title: "Leave Report",
            subtitle: filters.scope ? `Scope: ${filters.scope}` : undefined,
            columns: LEAVE_PDF_COLUMNS,
            rows,
          })
        : generateExcelReport({ sheetName: "Leave", columns: LEAVE_XLSX_COLUMNS, rows });
    },
  },
  payroll: {
    // Matches this task's own stated example exactly: `can(user, "payroll",
    // "view")`. Sufficient on its own — `payroll.run` is admin-only in
    // practice and admin bypasses `can()` entirely regardless of action
    // name, so there's no real role that holds `run` without `view` too.
    canAccess: (user) => can(user, "payroll", "view"),
    generateBuffer: async (filters, format, user) => {
      const records = await listPayroll({ scope: filters.scope, month: filters.month }, user);
      await Payroll.populate(records, { path: "employeeId", select: "name isActive" });
      const rows = buildPayrollRows(excludeInactiveOrDeletedRefs(records, "employeeId"));
      const subtitleParts = [filters.scope && `Scope: ${filters.scope}`, filters.month && `Month: ${filters.month}`].filter(
        Boolean
      );

      return format === "pdf"
        ? generatePdfReport({
            title: "Payroll Report",
            subtitle: subtitleParts.length > 0 ? subtitleParts.join(" | ") : undefined,
            columns: PAYROLL_PDF_COLUMNS,
            rows,
          })
        : generateExcelReport({ sheetName: "Payroll", columns: PAYROLL_XLSX_COLUMNS, rows });
    },
  },
  /**
   * A whole PAY RUN, matching the review table's columns (§7.58).
   *
   * GATED ON `payroll.run`, NEVER `payroll.view`. This returns every
   * employee's salary for a period in one file, and `payroll.view` means "own
   * payslip only" — it sits in the DEFAULT employee role template, so gating
   * this on it would hand the whole company's pay to every employee. That is
   * the §7.47 trap, found there by an access test returning 200 with every
   * salary in the body; `payroll.run` is this module's existing see-everyone
   * tier.
   *
   * The sibling `payroll` module above stays on `payroll.view` and is NOT a
   * leak: it scopes internally by `?scope=`, so a `view` holder only ever gets
   * their own records. This one has no such scoping — it is the run.
   */
  payrollRun: {
    canAccess: (user) => can(user, "payroll", "run"),
    generateBuffer: async (filters, format) => {
      const month = Number(filters.month);
      const year = Number(filters.year);

      if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year)) {
        throw new ApiError(400, "A valid month (1-12) and year are required");
      }

      const records = await Payroll.find({ month, year })
        .populate("employeeId", "name isActive")
        .sort({ "employeeId.name": 1 });
      const rows = buildPayrollRunRows(excludeInactiveOrDeletedRefs(records, "employeeId"));

      return format === "pdf"
        ? generatePdfReport({
            title: "Pay Run",
            subtitle: `${month}/${year}`,
            columns: PAYROLL_RUN_PDF_COLUMNS,
            rows,
          })
        : generateExcelReport({ sheetName: "Pay Run", columns: PAYROLL_RUN_XLSX_COLUMNS, rows });
    },
  },
  leads: {
    canAccess: (user) => can(user, "leads", "view"),
    generateBuffer: async (filters, format, user) => {
      const records = await listLeads(filters, user);
      await Lead.populate(records, { path: "ownerId", select: "name isActive" });
      const rows = buildLeadsRows(excludeInactiveOrDeletedRefs(records, "ownerId"));

      return format === "pdf"
        ? generatePdfReport({
            title: "Leads Report",
            subtitle: filters.status ? `Status: ${filters.status}` : undefined,
            columns: LEADS_PDF_COLUMNS,
            rows,
          })
        : generateExcelReport({ sheetName: "Leads", columns: LEADS_XLSX_COLUMNS, rows });
    },
  },
  customers: {
    canAccess: (user) => can(user, "customers", "view"),
    generateBuffer: async (filters, format, user) => {
      const records = await listCustomers(filters, user);
      await Customer.populate(records, { path: "ownerId", select: "name isActive" });
      const rows = buildCustomersRows(excludeInactiveOrDeletedRefs(records, "ownerId"));

      return format === "pdf"
        ? generatePdfReport({
            title: "Customers Report",
            subtitle: filters.status ? `Status: ${filters.status}` : undefined,
            columns: CUSTOMERS_PDF_COLUMNS,
            rows,
          })
        : generateExcelReport({ sheetName: "Customers", columns: CUSTOMERS_XLSX_COLUMNS, rows });
    },
  },
};

/**
 * `POST /reports/generate`'s implementation (and the two legacy per-module
 * report endpoints, `GET /attendance/report` and `GET /travel-logs/report`,
 * which call this same function directly): resolve the handler, gate on its
 * coarse access check (403 if not even eligible to attempt this module's
 * reports), fetch+render via that module's own logic, and return the raw
 * file buffer for the caller to stream directly as the HTTP response
 * (2026-08-04, §7.11 — Cloudinary's upload step was removed; a report is
 * generated on this server and never needs to leave it before reaching the
 * requester, matching the existing `GET /leads/export` and
 * `GET /payroll/:id/payslip` direct-stream precedent).
 */
export async function generateReport({ module, filters, format }, requestingUser) {
  const handler = MODULE_HANDLERS[module];

  if (!handler) {
    throw new ApiError(400, `module must be one of: ${Object.keys(MODULE_HANDLERS).join(", ")}`);
  }

  if (!handler.canAccess(requestingUser)) {
    throw new ApiError(403, "You do not have permission to generate this report");
  }

  return handler.generateBuffer(filters || {}, format, requestingUser);
}

// --- Leave rendering (new — leave.service.js has no report function of its
// own to reuse; only its scoped listLeaves query is reused here). One row
// shape feeds both `generateExcelReport` and `generatePdfReport` (2026-08-04
// — previously each format re-derived its own row text independently, which
// is exactly how the two ended up with the same "Unknown" employee-name bug
// in two separate places instead of one; see backend/README.md's Reports
// section for the full diagnosis) ------------------------------------------

// A record whose `employeeId`/`ownerId` didn't populate isn't a broken
// lookup — `Leave.populate`/`Lead.populate`/etc. above use the exact same
// pattern as every other populate in this codebase. It's a **genuinely
// unresolvable reference**: `user.service.js#hardDeleteUser` deliberately
// does NOT cascade-fix-up other records' references to a permanently
// deleted user (by design — see that function's own docblock). "Unknown"
// didn't communicate that distinction (looks like a generation bug, not a
// deliberate, audited deletion) — this label does.
const DELETED_USER_LABEL = "[Deleted User]";

function buildLeaveRows(records) {
  return records.map((record) => ({
    employee: record.employeeId?.name || DELETED_USER_LABEL,
    startDate: record.startDate,
    endDate: record.endDate,
    type: record.type,
    status: record.status,
    isDoubleDeduction: record.isDoubleDeduction,
  }));
}

const LEAVE_XLSX_COLUMNS = [
  { header: "Employee", key: "employee", width: 25 },
  { header: "Start Date", key: "startDate", width: 15 },
  { header: "End Date", key: "endDate", width: 15 },
  { header: "Type", key: "type", width: 18 },
  { header: "Status", key: "status", width: 14 },
  { header: "Double Deduction", key: "isDoubleDeduction", width: 16 },
];

const LEAVE_PDF_COLUMNS = [
  { header: "Employee", key: "employee", width: 2.5 },
  { header: "Start Date", key: "startDate", width: 1.5 },
  { header: "End Date", key: "endDate", width: 1.5 },
  { header: "Type", key: "type", width: 1.5 },
  { header: "Status", key: "status", width: 1.3 },
  { header: "2x Deduction", key: "isDoubleDeduction", width: 1.5 },
];

// --- Payroll rendering (new — payroll.service.js's only existing PDF
// builder is generatePayslipPdf, a single-record artifact, deliberately not
// reused here; only its scoped listPayroll query is reused) ---------------

function buildPayrollRows(records) {
  return records.map((record) => ({
    employee: record.employeeId?.name || DELETED_USER_LABEL,
    month: record.month,
    year: record.year,
    presentDays: record.presentDays,
    grossAmount: record.grossAmount,
    netAmount: record.netAmount,
    mileageReimbursement: record.mileageReimbursement,
  }));
}

/**
 * One row per employee, in the review table's column order so the export and
 * the screen cannot tell different stories. Every figure is read from the
 * stored record — nothing is recomputed here.
 */
function buildPayrollRunRows(records) {
  return records.map((record) => ({
    employee: record.employeeId?.name || "—",
    baseSalary: record.grossAmount,
    paidDays: record.paidDays,
    paidLeave: record.paidLeaveDays,
    lopDays: record.unpaidDeductionDays,
    lopDeduction: record.deduction,
    surcharge: record.surchargeAmount || 0,
    bonus: (record.adjustments || [])
      .filter((one) => one.amount > 0)
      .reduce((total, one) => total + one.amount, 0),
    otherDeductions: (record.adjustments || [])
      .filter((one) => one.amount < 0)
      .reduce((total, one) => total - one.amount, 0),
    netPayable: record.netAmount,
  }));
}

const PAYROLL_RUN_XLSX_COLUMNS = [
  { header: "Employee", key: "employee", width: 25 },
  { header: "Base Salary", key: "baseSalary", width: 14 },
  { header: "Paid Days", key: "paidDays", width: 12 },
  { header: "Paid Leave", key: "paidLeave", width: 12 },
  { header: "LOP Days", key: "lopDays", width: 12 },
  { header: "LOP Deduction", key: "lopDeduction", width: 16 },
  { header: "of which 2x surcharge", key: "surcharge", width: 20 },
  { header: "Bonus", key: "bonus", width: 12 },
  { header: "Other Deductions", key: "otherDeductions", width: 18 },
  { header: "Net Payable", key: "netPayable", width: 16 },
];

const PAYROLL_RUN_PDF_COLUMNS = [
  { header: "Employee", key: "employee", width: 2 },
  { header: "Base", key: "baseSalary", width: 1 },
  { header: "Paid Days", key: "paidDays", width: 0.9 },
  { header: "Paid Leave", key: "paidLeave", width: 0.9 },
  { header: "LOP Days", key: "lopDays", width: 0.9 },
  { header: "LOP Ded.", key: "lopDeduction", width: 1 },
  { header: "2x", key: "surcharge", width: 0.8 },
  { header: "Bonus", key: "bonus", width: 0.9 },
  { header: "Other Ded.", key: "otherDeductions", width: 1 },
  { header: "Net", key: "netPayable", width: 1 },
];

const PAYROLL_XLSX_COLUMNS = [
  { header: "Employee", key: "employee", width: 25 },
  { header: "Month", key: "month", width: 10 },
  { header: "Year", key: "year", width: 10 },
  { header: "Present Days", key: "presentDays", width: 14 },
  { header: "Gross Amount", key: "grossAmount", width: 16 },
  { header: "Net Amount", key: "netAmount", width: 16 },
  { header: "Mileage Reimbursement", key: "mileageReimbursement", width: 20 },
];

const PAYROLL_PDF_COLUMNS = [
  { header: "Employee", key: "employee", width: 2.2 },
  { header: "Month", key: "month", width: 0.8 },
  { header: "Year", key: "year", width: 0.8 },
  { header: "Present Days", key: "presentDays", width: 1.2 },
  { header: "Gross", key: "grossAmount", width: 1.3 },
  { header: "Net", key: "netAmount", width: 1.3 },
  { header: "Mileage", key: "mileageReimbursement", width: 1.2 },
];

// --- Leads rendering (new — deliberately NOT lead.service.js's own
// exportLeadsToExcel, which stays exactly as-is at GET /leads/export; only
// the scoped listLeads query is reused here) -------------------------------

function buildLeadsRows(records) {
  return records.map((record) => ({
    name: record.name,
    companyName: record.companyName,
    owner: record.ownerId?.name || DELETED_USER_LABEL,
    status: record.status,
    source: record.source,
    budget: record.budget,
  }));
}

const LEADS_XLSX_COLUMNS = [
  { header: "Name", key: "name", width: 25 },
  { header: "Company", key: "companyName", width: 25 },
  { header: "Owner", key: "owner", width: 20 },
  { header: "Status", key: "status", width: 16 },
  { header: "Source", key: "source", width: 16 },
  { header: "Budget", key: "budget", width: 14 },
];

const LEADS_PDF_COLUMNS = [
  { header: "Name", key: "name", width: 1.8 },
  { header: "Company", key: "companyName", width: 1.8 },
  { header: "Owner", key: "owner", width: 1.5 },
  { header: "Status", key: "status", width: 1.2 },
  { header: "Source", key: "source", width: 1.2 },
  { header: "Budget", key: "budget", width: 1 },
];

// --- Customers rendering (new) --------------------------------------------

function buildCustomersRows(records) {
  return records.map((record) => ({
    companyName: record.companyName,
    owner: record.ownerId?.name || DELETED_USER_LABEL,
    customerStatus: record.customerStatus,
    email: record.email,
    phone: record.phone,
  }));
}

const CUSTOMERS_XLSX_COLUMNS = [
  { header: "Company", key: "companyName", width: 25 },
  { header: "Owner", key: "owner", width: 20 },
  { header: "Status", key: "customerStatus", width: 14 },
  { header: "Email", key: "email", width: 25 },
  { header: "Phone", key: "phone", width: 18 },
];

const CUSTOMERS_PDF_COLUMNS = [
  { header: "Company", key: "companyName", width: 2 },
  { header: "Owner", key: "owner", width: 1.5 },
  { header: "Status", key: "customerStatus", width: 1.2 },
  { header: "Email", key: "email", width: 2 },
  { header: "Phone", key: "phone", width: 1.3 },
];
