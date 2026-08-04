import ApiError from "../../utils/ApiError.js";
import { can } from "../../helpers/permission.helper.js";
import { generateExcelReport, generatePdfReport } from "../../services/report.service.js";
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
      await Leave.populate(records, { path: "employeeId", select: "name" });

      return format === "pdf" ? buildLeavePdf(records) : buildLeaveXlsx(records);
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
      await Payroll.populate(records, { path: "employeeId", select: "name" });

      return format === "pdf" ? buildPayrollPdf(records) : buildPayrollXlsx(records);
    },
  },
  leads: {
    canAccess: (user) => can(user, "leads", "view"),
    generateBuffer: async (filters, format, user) => {
      const records = await listLeads(filters, user);
      await Lead.populate(records, { path: "ownerId", select: "name" });

      return format === "pdf" ? buildLeadsPdf(records) : buildLeadsXlsx(records);
    },
  },
  customers: {
    canAccess: (user) => can(user, "customers", "view"),
    generateBuffer: async (filters, format, user) => {
      const records = await listCustomers(filters, user);
      await Customer.populate(records, { path: "ownerId", select: "name" });

      return format === "pdf" ? buildCustomersPdf(records) : buildCustomersXlsx(records);
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
// own to reuse; only its scoped listLeaves query is reused here) ----------

function buildLeaveXlsx(records) {
  return generateExcelReport({
    sheetName: "Leave",
    columns: [
      { header: "Employee", key: "employee", width: 25 },
      { header: "Start Date", key: "startDate", width: 15 },
      { header: "End Date", key: "endDate", width: 15 },
      { header: "Type", key: "type", width: 18 },
      { header: "Status", key: "status", width: 14 },
      { header: "Double Deduction", key: "isDoubleDeduction", width: 16 },
    ],
    rows: records.map((record) => ({
      employee: record.employeeId?.name || "Unknown",
      startDate: record.startDate,
      endDate: record.endDate,
      type: record.type,
      status: record.status,
      isDoubleDeduction: record.isDoubleDeduction,
    })),
  });
}

function buildLeavePdf(records) {
  return generatePdfReport({
    title: "Leave Report",
    rows: records,
    formatRow: (record) => {
      const employeeName = record.employeeId?.name || "Unknown";

      return (
        `${employeeName} | ${record.startDate.toDateString()} - ${record.endDate.toDateString()} | ` +
        `Type: ${record.type} | Status: ${record.status}`
      );
    },
  });
}

// --- Payroll rendering (new — payroll.service.js's only existing PDF
// builder is generatePayslipPdf, a single-record artifact, deliberately not
// reused here; only its scoped listPayroll query is reused) ---------------

function buildPayrollXlsx(records) {
  return generateExcelReport({
    sheetName: "Payroll",
    columns: [
      { header: "Employee", key: "employee", width: 25 },
      { header: "Month", key: "month", width: 10 },
      { header: "Year", key: "year", width: 10 },
      { header: "Present Days", key: "presentDays", width: 14 },
      { header: "Gross Amount", key: "grossAmount", width: 16 },
      { header: "Net Amount", key: "netAmount", width: 16 },
      { header: "Mileage Reimbursement", key: "mileageReimbursement", width: 20 },
    ],
    rows: records.map((record) => ({
      employee: record.employeeId?.name || "Unknown",
      month: record.month,
      year: record.year,
      presentDays: record.presentDays,
      grossAmount: record.grossAmount,
      netAmount: record.netAmount,
      mileageReimbursement: record.mileageReimbursement,
    })),
  });
}

function buildPayrollPdf(records) {
  return generatePdfReport({
    title: "Payroll Report",
    rows: records,
    formatRow: (record) => {
      const employeeName = record.employeeId?.name || "Unknown";

      return (
        `${employeeName} | ${record.month}/${record.year} | Gross: ${record.grossAmount.toFixed(2)} | ` +
        `Net: ${record.netAmount.toFixed(2)}`
      );
    },
  });
}

// --- Leads rendering (new — deliberately NOT lead.service.js's own
// exportLeadsToExcel, which stays exactly as-is at GET /leads/export; only
// the scoped listLeads query is reused here) -------------------------------

function buildLeadsXlsx(records) {
  return generateExcelReport({
    sheetName: "Leads",
    columns: [
      { header: "Name", key: "name", width: 25 },
      { header: "Company", key: "companyName", width: 25 },
      { header: "Owner", key: "owner", width: 20 },
      { header: "Status", key: "status", width: 16 },
      { header: "Source", key: "source", width: 16 },
      { header: "Budget", key: "budget", width: 14 },
    ],
    rows: records.map((record) => ({
      name: record.name,
      companyName: record.companyName,
      owner: record.ownerId?.name || "Unknown",
      status: record.status,
      source: record.source,
      budget: record.budget,
    })),
  });
}

function buildLeadsPdf(records) {
  return generatePdfReport({
    title: "Leads Report",
    rows: records,
    formatRow: (record) => {
      const ownerName = record.ownerId?.name || "Unknown";

      return `${record.name} | ${record.companyName || "-"} | Owner: ${ownerName} | Status: ${record.status}`;
    },
  });
}

// --- Customers rendering (new) --------------------------------------------

function buildCustomersXlsx(records) {
  return generateExcelReport({
    sheetName: "Customers",
    columns: [
      { header: "Company", key: "companyName", width: 25 },
      { header: "Owner", key: "owner", width: 20 },
      { header: "Status", key: "customerStatus", width: 14 },
      { header: "Email", key: "email", width: 25 },
      { header: "Phone", key: "phone", width: 18 },
    ],
    rows: records.map((record) => ({
      companyName: record.companyName,
      owner: record.ownerId?.name || "Unknown",
      customerStatus: record.customerStatus,
      email: record.email,
      phone: record.phone,
    })),
  });
}

function buildCustomersPdf(records) {
  return generatePdfReport({
    title: "Customers Report",
    rows: records,
    formatRow: (record) => {
      const ownerName = record.ownerId?.name || "Unknown";

      return `${record.companyName} | Owner: ${ownerName} | Status: ${record.customerStatus}`;
    },
  });
}
