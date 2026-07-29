import ApiError from "../../utils/ApiError.js";
import { can } from "../../helpers/permission.helper.js";
import { createNotification } from "../notification/notification.service.js";
import Leave from "./leave.model.js";
import User from "../user/user.model.js";

// One paid leave day per calendar month (§11.7) — exported so `getLeaveBalance`
// below and the frontend can both reference the same number rather than a
// magic `1` living in two places.
export const PAID_LEAVE_MONTHLY_LIMIT = 1;

/**
 * Requesting your own leave needs no `leave.*` grant at all — a self-service
 * action, the same reasoning as Attendance check-in/out (§7.4) and Location's
 * POST /pings (§7.4b). Only an admin may request leave on behalf of someone
 * else — needed so the mark-unapproved-absence flow below has somewhere to
 * start from for an employee who never submitted a request themselves.
 */
export async function requestLeave(payload, requestingUser) {
  const employeeId = requestingUser.role === "admin" && payload.employeeId ? payload.employeeId : requestingUser._id;

  const leave = await Leave.create({
    employeeId,
    startDate: payload.startDate,
    endDate: payload.endDate,
    type: payload.type || "paid",
    reason: payload.reason,
    isHalfDay: Boolean(payload.isHalfDay),
  });

  await notifyLeaveRequested(leave, employeeId);

  return leave;
}

/**
 * Notifies the requester's manager (if `managerId` is set) AND every admin —
 * a plain `User.find({ role: "admin" })`, since there's no existing "all
 * admins" recipient concept anywhere else `createNotification` is called
 * from (Leads/Tickets both notify one specific, already-known user). The
 * requester itself is never a recipient of its own submission, the same
 * self-notify skip `lead.service.js#notifyLeadAssignment` already
 * establishes. Never blocks the request — `createNotification` itself
 * already never throws on a push failure, and a lookup failure here would
 * only ever fail the same way the create above would.
 */
async function notifyLeaveRequested(leave, employeeId) {
  const employee = await User.findById(employeeId);

  if (!employee) {
    return;
  }

  const recipientIds = new Set();

  if (employee.managerId) {
    recipientIds.add(String(employee.managerId));
  }

  const admins = await User.find({ role: "admin" }).select("_id");
  admins.forEach((admin) => recipientIds.add(String(admin._id)));
  recipientIds.delete(String(employeeId));

  const halfDaySuffix = leave.isHalfDay ? " (half day)" : "";
  const message = `${employee.name} requested ${leave.type} leave${halfDaySuffix} from ${formatDate(leave.startDate)} to ${formatDate(leave.endDate)}`;

  await Promise.all(
    Array.from(recipientIds).map((userId) =>
      createNotification(userId, "leave_requested", message, { module: "leave", id: leave._id })
    )
  );
}

/**
 * Notifies the requester once an admin decides their request — approve or
 * decline. Skipped if the admin is deciding on their own leave request (a
 * self-requested-then-self-approved edge case), same self-notify skip as
 * `notifyLeaveRequested` above.
 */
async function notifyLeaveDecision(leave, adminUser) {
  if (String(leave.employeeId) === String(adminUser._id)) {
    return;
  }

  const isApproved = leave.status === "approved";
  const type = isApproved ? "leave_approved" : "leave_declined";
  const reasonSuffix = !isApproved && leave.declineReason ? ` — ${leave.declineReason}` : "";
  const message = `Your ${leave.type} leave request (${formatDate(leave.startDate)} to ${formatDate(leave.endDate)}) has been ${isApproved ? "approved" : "declined"}${reasonSuffix}`;

  await createNotification(leave.employeeId, type, message, { module: "leave", id: leave._id });
}

function formatDate(date) {
  return new Date(date).toISOString().slice(0, 10);
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

  await notifyLeaveDecision(leave, adminUser);

  return leave;
}

/**
 * Admin-only (§7.5 addition). Reuses the exact same "only a pending request
 * can be decided" guard `approveLeave` already enforces. Sets `status:
 * "rejected"` — the existing, previously-unused `LEAVE_STATUSES` value
 * (leave.model.js already declared it, no endpoint ever set it) rather than
 * adding a new `declined` enum value that would mean the same thing. Reuses
 * `approvedBy` to record which admin made this approval-state decision, the
 * same treatment `markUnapprovedAbsence` below already gives that field even
 * though its own outcome isn't literally "approved" either — this is "the
 * admin who last decided this record's approval state," not strictly
 * "approved by."
 */
export async function declineLeave(leaveId, reason, adminUser) {
  const leave = await Leave.findById(leaveId);

  if (!leave) {
    throw new ApiError(404, "Leave request not found");
  }

  if (leave.status !== "pending") {
    throw new ApiError(409, "Only a pending leave request can be declined");
  }

  leave.status = "rejected";
  leave.approvedBy = adminUser._id;
  leave.declineReason = reason || null;
  await leave.save();

  await notifyLeaveDecision(leave, adminUser);

  return leave;
}

/**
 * Half-day-aware day count — the single function every quota/deduction
 * calculation in this module (and `payroll.service.js`'s own leave-day
 * math) goes through, so "does isHalfDay count as 0.5?" is answered in
 * exactly one place. A half-day request always describes a single day
 * (enforced at the validation layer), so it's always exactly 0.5 regardless
 * of the stored startDate/endDate span.
 */
export function computeLeaveDays(leave) {
  if (leave.isHalfDay) {
    return 0.5;
  }

  return countInclusiveDays(leave.startDate, leave.endDate);
}

async function ensureWithinMonthlyPaidLeaveQuota(leave) {
  const requestedDays = computeLeaveDays(leave);

  if (requestedDays > 1) {
    throw new ApiError(
      409,
      "A single paid leave request cannot exceed 1 day — only one paid leave is provided per month."
    );
  }

  const alreadyUsedDays = await getApprovedPaidLeaveDaysForMonth(leave.employeeId, leave.startDate, leave._id);

  if (alreadyUsedDays + requestedDays > 1) {
    throw new ApiError(409, "This employee has already used their one paid leave for this month.");
  }
}

/**
 * Shared by the quota check above AND `getLeaveBalance` below — "how many
 * approved paid-leave days has this employee used in the calendar month
 * containing `referenceDate`" is one calculation, not two. `excludeLeaveId`
 * only matters for the quota check (a request being re-evaluated must not
 * count itself as already-used); `getLeaveBalance` omits it.
 */
async function getApprovedPaidLeaveDaysForMonth(employeeId, referenceDate, excludeLeaveId = null) {
  const { start, end } = resolveMonthRange(referenceDate);

  const filter = {
    employeeId,
    type: "paid",
    status: "approved",
    startDate: { $gte: start, $lt: end },
  };

  if (excludeLeaveId) {
    filter._id = { $ne: excludeLeaveId };
  }

  const approved = await Leave.find(filter);

  return approved.reduce((total, existing) => total + computeLeaveDays(existing), 0);
}

/**
 * `GET /leave/balance` (§7.5 addition) — own balance always reachable, no
 * grant needed (same "own data" precedent as `GET /attendance/me`/
 * `GET /auth/me`); `?employeeId=` for someone else reuses the exact same
 * `leave.view_team`/`view_all` tiers `listLeaves` already checks for
 * `scope=team`/`scope=all`, rather than inventing a third permission concept
 * for what is really the same "can this caller see this employee's leave
 * data" question. A manager's `view_team` grant is further scoped to their
 * own direct reports (mirroring `scope=team`'s own `managerId` filter); an
 * out-of-scope employeeId for a manager, or any employeeId at all for a
 * caller with neither tier, is a 403 rather than silently falling back to
 * "own."
 */
export async function getLeaveBalance(employeeIdParam, requestingUser) {
  let employeeId = requestingUser._id;

  if (employeeIdParam && String(employeeIdParam) !== String(requestingUser._id)) {
    if (can(requestingUser, "leave", "view_all")) {
      employeeId = employeeIdParam;
    } else if (can(requestingUser, "leave", "view_team")) {
      const targetEmployee = await User.findOne({ _id: employeeIdParam, managerId: requestingUser._id });

      if (!targetEmployee) {
        throw new ApiError(403, "You can only view the leave balance of your own direct reports");
      }

      employeeId = employeeIdParam;
    } else {
      throw new ApiError(403, "You do not have permission to view this employee's leave balance");
    }
  }

  const paidLeaveUsed = await getApprovedPaidLeaveDaysForMonth(employeeId, new Date());
  const paidLeaveRemaining = Math.max(0, PAID_LEAVE_MONTHLY_LIMIT - paidLeaveUsed);

  return { paidLeaveUsed, paidLeaveLimit: PAID_LEAVE_MONTHLY_LIMIT, paidLeaveRemaining };
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
