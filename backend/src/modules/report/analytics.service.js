import { can } from "../../helpers/permission.helper.js";
import Lead from "../lead/lead.model.js";
import { resolveOwnershipFilter as resolveLeadOwnershipFilter } from "../lead/lead.service.js";
import Customer from "../customer/customer.model.js";
import Contract from "../customer/contract.model.js";
import {
  resolveOwnershipFilter as resolveCustomerOwnershipFilter,
  getVisibleCustomerIds,
} from "../customer/customer.service.js";
import AMC from "../amc/amc.model.js";
import Payment from "../payment/payment.model.js";
import Attendance from "../attendance/attendance.model.js";
import { resolveDirectReportIds } from "../attendance/attendance.service.js";
import Payroll from "../payroll/payroll.model.js";

/**
 * Reports & Analytics — 11 aggregation endpoints backing the charts on the
 * new Reports page, distinct from this same module's existing
 * `report.service.js` (the raw PDF/Excel export dispatcher, unchanged by
 * this file). Kept as a sibling file rather than folded into
 * `report.service.js` — that file is a cross-module dispatcher already at
 * 271 lines with no split-service precedent anywhere else in this backend
 * (every other module keeps CRUD + its own reporting in one file), but
 * doubling that file's size for a conceptually different feature (chart
 * aggregation vs. file-generation) seemed like the wrong tradeoff. This
 * file still follows the codebase's strongest actual convention — reuse a
 * target module's own scoping/fetch logic rather than duplicate it —  by
 * importing each module's own (now-exported) ownership-filter helpers
 * instead of re-deriving admin/manager/owner rules a second time.
 *
 * `from`/`to` query params are `YYYY-MM-DD` throughout, same convention as
 * Attendance/TravelLog's report generators and the Payments module's own
 * date filters — parsed via `new Date(from)`/`$lt` + one day added to `to`
 * (inclusive both ends), not a new convention.
 */

// Same `$gte`/`$lt`-plus-one-day convention already used by Attendance/
// TravelLog's report generators and Payments' list endpoint.
function addOneDay(date) {
  const next = new Date(date);
  next.setDate(next.getDate() + 1);
  return next;
}

function buildDateRangeFilter(field, from, to) {
  const range = {};

  if (from) {
    range.$gte = new Date(from);
  }

  if (to) {
    range.$lt = addOneDay(new Date(to));
  }

  return Object.keys(range).length > 0 ? { [field]: range } : {};
}

// Groups a month string ($dateToString "%Y-%m") result set — shared by every
// trend endpoint below so the empty-result/sort shape stays identical.
function sortByMonth(rows) {
  return [...rows].sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));
}

// ---------------------------------------------------------------------------
// Leads (1-4) — admin=org-wide, manager=team, sales_associate=own, per
// lead.service.js#resolveOwnershipFilter (reused directly, not duplicated).
// ---------------------------------------------------------------------------

export async function getLeadsPipeline(requestingUser) {
  const scopeFilter = await resolveLeadOwnershipFilter(requestingUser);

  return Lead.aggregate([
    { $match: scopeFilter },
    { $group: { _id: "$status", count: { $sum: 1 } } },
    { $project: { _id: 0, status: "$_id", count: 1 } },
    { $sort: { status: 1 } },
  ]);
}

// No separate "won at" timestamp exists on Lead (only the current `status`
// field, no history) — grouped by `createdAt` month: of the leads CREATED in
// a given month, how many are CURRENTLY won. Stated here since it's an
// interpretive choice the schema doesn't make obvious on its own.
export async function getLeadsConversion({ from, to }, requestingUser) {
  const scopeFilter = await resolveLeadOwnershipFilter(requestingUser);
  const dateFilter = buildDateRangeFilter("createdAt", from, to);

  const rows = await Lead.aggregate([
    { $match: { ...scopeFilter, ...dateFilter } },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
        totalLeads: { $sum: 1 },
        wonLeads: { $sum: { $cond: [{ $eq: ["$status", "won"] }, 1, 0] } },
      },
    },
    {
      $project: {
        _id: 0,
        month: "$_id",
        totalLeads: 1,
        wonLeads: 1,
        conversionRate: {
          $cond: [
            { $eq: ["$totalLeads", 0] },
            0,
            { $round: [{ $multiply: [{ $divide: ["$wonLeads", "$totalLeads"] }, 100] }, 2] },
          ],
        },
      },
    },
  ]);

  return sortByMonth(rows);
}

export async function getLeadsBySource(requestingUser) {
  const scopeFilter = await resolveLeadOwnershipFilter(requestingUser);

  return Lead.aggregate([
    { $match: scopeFilter },
    { $group: { _id: { $ifNull: ["$source", "Unknown"] }, count: { $sum: 1 } } },
    { $project: { _id: 0, source: "$_id", count: 1 } },
    { $sort: { count: -1 } },
  ]);
}

export async function getLeadsByClientType(requestingUser) {
  const scopeFilter = await resolveLeadOwnershipFilter(requestingUser);

  return Lead.aggregate([
    { $match: scopeFilter },
    { $group: { _id: { $ifNull: ["$clientType", "Unknown"] }, count: { $sum: 1 } } },
    { $project: { _id: 0, clientType: "$_id", count: 1 } },
    { $sort: { count: -1 } },
  ]);
}

// ---------------------------------------------------------------------------
// Customers (5-7) — admin=org-wide, manager=team, owner=own, per
// customer.service.js#resolveOwnershipFilter/#getVisibleCustomerIds.
// ---------------------------------------------------------------------------

export async function getCustomersGrowth({ from, to }, requestingUser) {
  const scopeFilter = await resolveCustomerOwnershipFilter(requestingUser);
  const dateFilter = buildDateRangeFilter("signedUpAt", from, to);

  const rows = await Customer.aggregate([
    { $match: { ...scopeFilter, ...dateFilter } },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m", date: "$signedUpAt" } },
        newCustomers: { $sum: 1 },
      },
    },
    { $project: { _id: 0, month: "$_id", newCustomers: 1 } },
  ]);

  return sortByMonth(rows);
}

export async function getCustomersStatusSplit(requestingUser) {
  const scopeFilter = await resolveCustomerOwnershipFilter(requestingUser);

  const rows = await Customer.aggregate([
    { $match: scopeFilter },
    { $group: { _id: "$customerStatus", count: { $sum: 1 } } },
  ]);

  const result = { active: 0, inactive: 0 };

  rows.forEach((row) => {
    if (row._id === "active" || row._id === "inactive") {
      result[row._id] = row.count;
    }
  });

  return result;
}

// Contract has no `ownerId` of its own — scoped via the underlying
// Customer's ownership (`getVisibleCustomerIds`), the exact same reasoning
// amc.service.js#resolveAMCFilter already established for AMC.
export async function getCustomersContractValue(requestingUser) {
  const visibleCustomerIds = await getVisibleCustomerIds(requestingUser);
  const scopeFilter = visibleCustomerIds ? { customerId: { $in: visibleCustomerIds } } : {};

  return Contract.aggregate([
    { $match: scopeFilter },
    {
      $group: {
        _id: "$type",
        totalValue: { $sum: { $ifNull: ["$amount", 0] } },
        count: { $sum: 1 },
      },
    },
    { $project: { _id: 0, type: "$_id", totalValue: 1, count: 1 } },
    { $sort: { type: 1 } },
  ]);
}

// ---------------------------------------------------------------------------
// Payments (8) — admin-only, no team/own tiers (§5's matrix), gated
// entirely at the route level (authorize("payments", "view")) — no
// scoping filter needed here at all, matching payment.service.js#listPayments.
// ---------------------------------------------------------------------------

export async function getPaymentsTrend({ from, to }) {
  const dateFilter = buildDateRangeFilter("date", from, to);

  const rows = await Payment.aggregate([
    { $match: dateFilter },
    { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$date" } }, totalAmount: { $sum: "$amount" } } },
    { $project: { _id: 0, month: "$_id", totalAmount: 1 } },
  ]);

  return sortByMonth(rows);
}

// ---------------------------------------------------------------------------
// AMC (9) — admin=org-wide, manager=team, owner=own, via the same
// `getVisibleCustomerIds` reuse amc.service.js#resolveAMCFilter already
// established (AMC has no `ownerId` of its own). A plain scoped/sorted
// `find` + `populate`, not a `$group` aggregation — there's no grouping
// need here, just a filtered, name-resolved list.
// ---------------------------------------------------------------------------

export async function getAmcRenewalsUpcoming({ days }, requestingUser) {
  const visibleCustomerIds = await getVisibleCustomerIds(requestingUser);
  const windowDays = Number(days) > 0 ? Number(days) : 30;

  const now = new Date();
  const windowEnd = new Date(now);
  windowEnd.setDate(windowEnd.getDate() + windowDays);

  const filter = {
    renewalDate: { $gte: now, $lte: windowEnd },
    ...(visibleCustomerIds ? { customerId: { $in: visibleCustomerIds } } : {}),
  };

  const records = await AMC.find(filter).sort({ renewalDate: 1 }).populate("customerId", "companyName");

  const renewals = records.map((record) => ({
    customerId: record.customerId?._id || null,
    customerName: record.customerId?.companyName || "—",
    renewalDate: record.renewalDate,
    amount: record.amount,
  }));

  return { count: renewals.length, renewals };
}

// ---------------------------------------------------------------------------
// Attendance (10) — admin=org-wide, manager=team, exactly
// attendance.service.js#getTeamAttendance's own org-wide/team branching
// (`can(..., "view_all")`), reused rather than re-derived.
// ---------------------------------------------------------------------------

export async function getAttendanceTrend({ from, to }, requestingUser) {
  const employeeFilter = can(requestingUser, "attendance", "view_all")
    ? {}
    : { employeeId: { $in: await resolveDirectReportIds(requestingUser) } };
  const dateFilter = buildDateRangeFilter("date", from, to);

  const rows = await Attendance.aggregate([
    { $match: { ...employeeFilter, ...dateFilter } },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m", date: "$date" } },
        total: { $sum: 1 },
        // "half_day" counts as half a present day — the same partial-credit
        // reasoning Payroll's own gross/net computation already applies.
        presentWeighted: {
          $sum: {
            $switch: {
              branches: [
                { case: { $eq: ["$status", "present"] }, then: 1 },
                { case: { $eq: ["$status", "half_day"] }, then: 0.5 },
              ],
              default: 0,
            },
          },
        },
      },
    },
    {
      $project: {
        _id: 0,
        month: "$_id",
        attendanceRate: {
          $cond: [
            { $eq: ["$total", 0] },
            0,
            { $round: [{ $multiply: [{ $divide: ["$presentWeighted", "$total"] }, 100] }, 2] },
          ],
        },
      },
    },
  ]);

  return sortByMonth(rows);
}

// ---------------------------------------------------------------------------
// Payroll (11) — admin-only (§5: no `view_all`/`view_team` tier at all for
// Payroll, deliberately — salary data is more sensitive), gated at the
// route level via `requireAdmin`, exactly matching `POST /payroll/run`'s
// existing gate rather than inventing a `payroll.view_all` action.
// ---------------------------------------------------------------------------

// Payroll stores `year`/`month` as separate Numbers, not a Date — `from`/`to`
// (YYYY-MM-DD, same convention as every other endpoint here) are converted
// to a single comparable "month index" (year*12 + zero-based month) so the
// $match can use $expr instead of inventing a second date-range shape.
function parseMonthIndexBound(dateString) {
  if (!dateString) {
    return null;
  }

  const date = new Date(dateString);

  return Number.isNaN(date.getTime()) ? null : date.getFullYear() * 12 + date.getMonth();
}

export async function getPayrollCostTrend({ from, to }) {
  const fromBound = parseMonthIndexBound(from);
  const toBound = parseMonthIndexBound(to);
  const matchStage = {};

  if (fromBound !== null || toBound !== null) {
    const monthIndexExpr = { $add: [{ $multiply: ["$year", 12] }, { $subtract: ["$month", 1] }] };
    const conditions = [];

    if (fromBound !== null) {
      conditions.push({ $gte: [monthIndexExpr, fromBound] });
    }

    if (toBound !== null) {
      conditions.push({ $lte: [monthIndexExpr, toBound] });
    }

    matchStage.$expr = conditions.length > 1 ? { $and: conditions } : conditions[0];
  }

  const rows = await Payroll.aggregate([
    { $match: matchStage },
    { $group: { _id: { year: "$year", month: "$month" }, totalCost: { $sum: "$netAmount" } } },
    {
      $project: {
        _id: 0,
        month: {
          $concat: [
            { $toString: "$_id.year" },
            "-",
            {
              $cond: [
                { $lt: ["$_id.month", 10] },
                { $concat: ["0", { $toString: "$_id.month" }] },
                { $toString: "$_id.month" },
              ],
            },
          ],
        },
        totalCost: 1,
      },
    },
  ]);

  return sortByMonth(rows);
}
