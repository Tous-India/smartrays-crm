import ApiError from "../../utils/ApiError.js";
import { can } from "../../helpers/permission.helper.js";
import Leave from "./leave.model.js";
import User from "../user/user.model.js";

/**
 * Requesting your own leave needs no `leave.*` grant at all — a self-service
 * action, the same reasoning as Attendance check-in/out (§7.4) and Location's
 * POST /pings (§7.4b). Only an admin may request leave on behalf of someone
 * else — needed so the mark-unapproved-absence flow below has somewhere to
 * start from for an employee who never submitted a request themselves.
 */
export async function requestLeave(payload, requestingUser) {
  const employeeId = requestingUser.role === "admin" && payload.employeeId ? payload.employeeId : requestingUser._id;

  return Leave.create({
    employeeId,
    startDate: payload.startDate,
    endDate: payload.endDate,
    type: payload.type || "paid",
    reason: payload.reason,
  });
}

/**
 * `scope=own` (default) needs `leave.view`; `scope=team` needs
 * `leave.view_team` (resolves to direct reports via managerId, §11.9);
 * `scope=all` needs `leave.view_all`. Unlike Location's implicit
 * union-of-every-held-grant view, §7.5 has the caller explicitly choose a
 * scope via the query param, so each scope is checked against its own
 * specific permission rather than resolving one combined visible-id set.
 */
export async function listLeaves(scope, requestingUser) {
  const resolvedScope = scope || "own";

  if (resolvedScope === "team") {
    if (!can(requestingUser, "leave", "view_team")) {
      throw new ApiError(403, "You do not have permission to view your team's leave requests");
    }

    const teamMembers = await User.find({ managerId: requestingUser._id }).select("_id");

    return Leave.find({ employeeId: { $in: teamMembers.map((member) => member._id) } }).sort({
      createdAt: -1,
    });
  }

  if (resolvedScope === "all") {
    if (!can(requestingUser, "leave", "view_all")) {
      throw new ApiError(403, "You do not have permission to view all leave requests");
    }

    return Leave.find({}).sort({ createdAt: -1 });
  }

  if (!can(requestingUser, "leave", "view")) {
    throw new ApiError(403, "You do not have permission to view leave requests");
  }

  return Leave.find({ employeeId: requestingUser._id }).sort({ createdAt: -1 });
}

/**
 * Admin-only (§7.5). A `paid`-type request is capped at the one-paid-leave-
 * per-calendar-month rule (§11.7, resolved 2026-07-13): a single request
 * can't span more than 1 day, and approving it must not push the employee's
 * total APPROVED paid-leave days for that calendar month above 1. No
 * carry-over — an unused paid leave in one month does not roll into the
 * next; this is a deliberate assumption where the source documents were
 * silent, stated explicitly per this task's own instructions.
 */
export async function approveLeave(leaveId, adminUser) {
  const leave = await Leave.findById(leaveId);

  if (!leave) {
    throw new ApiError(404, "Leave request not found");
  }

  if (leave.status !== "pending") {
    throw new ApiError(409, "Only a pending leave request can be approved");
  }

  if (leave.type === "paid") {
    await ensureWithinMonthlyPaidLeaveQuota(leave);
  }

  leave.status = "approved";
  leave.approvedBy = adminUser._id;
  await leave.save();

  return leave;
}

async function ensureWithinMonthlyPaidLeaveQuota(leave) {
  const requestedDays = countInclusiveDays(leave.startDate, leave.endDate);

  if (requestedDays > 1) {
    throw new ApiError(
      409,
      "A single paid leave request cannot exceed 1 day — only one paid leave is provided per month."
    );
  }

  const { start, end } = resolveMonthRange(leave.startDate);

  const approvedThisMonth = await Leave.find({
    employeeId: leave.employeeId,
    type: "paid",
    status: "approved",
    startDate: { $gte: start, $lt: end },
    _id: { $ne: leave._id },
  });

  const alreadyUsedDays = approvedThisMonth.reduce(
    (total, existing) => total + countInclusiveDays(existing.startDate, existing.endDate),
    0
  );

  if (alreadyUsedDays + requestedDays > 1) {
    throw new ApiError(409, "This employee has already used their one paid leave for this month.");
  }
}

function countInclusiveDays(startDate, endDate) {
  const oneDayMs = 24 * 60 * 60 * 1000;

  return Math.round((startOfDay(endDate) - startOfDay(startDate)) / oneDayMs) + 1;
}

function startOfDay(date) {
  const value = new Date(date);

  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function resolveMonthRange(date) {
  const value = new Date(date);
  const start = new Date(value.getFullYear(), value.getMonth(), 1);
  const end = new Date(value.getFullYear(), value.getMonth() + 1, 1);

  return { start, end };
}

/**
 * Admin-only (§7.5). Retroactively converts a leave record into the
 * unapproved-absence case, per the 2x rule (smartrays.md): an employee who
 * takes leave without going through approval, and whom an admin has to mark
 * absent, is counted as 2 days' deduction. This is an admin decree, not a
 * normal approval — it works regardless of the record's current status, and
 * doesn't run the paid-leave quota check since it's never `type: "paid"`.
 */
export async function markUnapprovedAbsence(leaveId, adminUser) {
  const leave = await Leave.findById(leaveId);

  if (!leave) {
    throw new ApiError(404, "Leave request not found");
  }

  leave.type = "unapproved_absence";
  leave.isDoubleDeduction = true;
  leave.status = "approved";
  leave.approvedBy = adminUser._id;
  await leave.save();

  return leave;
}
