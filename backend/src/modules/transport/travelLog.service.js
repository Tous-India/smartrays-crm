import ApiError from "../../utils/ApiError.js";
import { can } from "../../helpers/permission.helper.js";
import { getDistanceKm } from "../../services/googleMaps.service.js";
import { generateExcelReport, generatePdfReport } from "../../services/report.service.js";
import TravelLog from "./travelLog.model.js";
import User from "../user/user.model.js";

/**
 * Called from attendance.service.js#checkOut (not the other way around —
 * this module has no dependency on Attendance at all, it just receives
 * whatever coords checkout already has). Never throws: checkout must never
 * fail because travel logging failed, whether that's missing coords or a
 * Google Maps API error. Returns null in either "nothing to log" case.
 */
export async function generateAutoTravelLog({ employeeId, date, originCoords, destinationCoords }) {
  if (!originCoords || !destinationCoords) {
    return null;
  }

  try {
    const distanceKm = await getDistanceKm(originCoords, destinationCoords);

    return await TravelLog.create({
      employeeId,
      date,
      originCoords,
      destinationCoords,
      distanceKm,
      source: "auto",
    });
  } catch (error) {
    return null;
  }
}

/**
 * Manual entry. Self-service by default — an employee logs their own travel,
 * no permission grant needed (same reasoning as Attendance check-in/out and
 * Leave's request endpoint). A manager may log on behalf of their own direct
 * report; an admin may log on behalf of anyone — this is a structural
 * relationship check, not a `can()` permission tier, the same shape as
 * Project's team-assignment restriction.
 *
 * Deliberately stricter than Leads' `ownerId`-forcing precedent: a plain
 * employee/sales_associate naming someone else's `employeeId` is rejected
 * outright (403), not silently redirected to themselves. Leads' silent
 * force-to-self makes sense there because reassigning record ownership is
 * low-stakes and the "correct" outcome is unambiguous; asserting a fact about
 * someone ELSE's physical travel is a different kind of claim, and silently
 * logging it against the wrong employee instead of rejecting it outright
 * would hide a real mistake rather than surface it.
 *
 * If `distanceKm` is supplied directly, it's used as-is — manual entries may
 * not always have precise coords, so a caller-supplied value is never
 * overridden by a Google Maps lookup. Otherwise, if both coords are given,
 * distanceKm is computed the same way an auto-generated entry's is.
 */
export async function createManualTravelLog(payload, requestingUser) {
  const employeeId = await resolveEmployeeIdForManualEntry(payload.employeeId, requestingUser);

  let distanceKm = payload.distanceKm ?? null;

  if (distanceKm === null && payload.originCoords && payload.destinationCoords) {
    distanceKm = await getDistanceKm(payload.originCoords, payload.destinationCoords);
  }

  return TravelLog.create({
    employeeId,
    date: payload.date ? new Date(payload.date) : new Date(),
    originCoords: payload.originCoords,
    destinationCoords: payload.destinationCoords,
    distanceKm,
    source: "manual",
  });
}

async function resolveEmployeeIdForManualEntry(requestedEmployeeId, requestingUser) {
  if (!requestedEmployeeId || String(requestedEmployeeId) === String(requestingUser._id)) {
    return requestingUser._id;
  }

  if (requestingUser.role === "admin") {
    return requestedEmployeeId;
  }

  if (requestingUser.role === "manager") {
    const target = await User.findById(requestedEmployeeId);

    if (target && String(target.managerId) === String(requestingUser._id)) {
      return requestedEmployeeId;
    }
  }

  throw new ApiError(
    403,
    "You can only log travel for yourself, or — as a manager — for your own direct reports"
  );
}

/**
 * Approve/reject a `pending` travel log — gated by "the target employee's
 * manager, or admin," the same structural relationship check as manual-entry
 * attribution above, not a `can()` permission tier (§7.6, resolved 2026-07-13
 * alongside §11.4). Auto-generated and manual entries both default to
 * `pending` and never auto-approve — mileage reimbursement (Payroll, §7.7)
 * must only ever be computed from entries someone with authority actually
 * signed off on. `approvedBy`/`approvedAt` are used generically for "who
 * resolved this and when," for both outcomes, not just approvals — the same
 * naming Leave's `approvedBy` already uses even for `mark-unapproved-absence`
 * (§7.5), which isn't a normal approval either.
 */
export async function approveTravelLog(travelLogId, requestingUser) {
  return setTravelLogStatus(travelLogId, "approved", requestingUser);
}

export async function rejectTravelLog(travelLogId, requestingUser) {
  return setTravelLogStatus(travelLogId, "rejected", requestingUser);
}

async function setTravelLogStatus(travelLogId, status, requestingUser) {
  const travelLog = await TravelLog.findById(travelLogId);

  if (!travelLog) {
    throw new ApiError(404, "Travel log not found");
  }

  const isAdmin = requestingUser.role === "admin";
  const isManagerOfEmployee = await isDirectManagerOf(travelLog.employeeId, requestingUser);

  if (!isAdmin && !isManagerOfEmployee) {
    throw new ApiError(
      403,
      "Only this employee's manager or an admin can approve or reject their travel logs"
    );
  }

  if (travelLog.status !== "pending") {
    throw new ApiError(409, "Only a pending travel log can be approved or rejected");
  }

  travelLog.status = status;
  travelLog.approvedBy = requestingUser._id;
  travelLog.approvedAt = new Date();
  await travelLog.save();

  return travelLog;
}

async function isDirectManagerOf(employeeId, requestingUser) {
  if (requestingUser.role !== "manager") {
    return false;
  }

  const employee = await User.findById(employeeId);

  return Boolean(employee && String(employee.managerId) === String(requestingUser._id));
}

/**
 * `scope=own` (default) needs `travelLogs.view`; `scope=team` needs
 * `travelLogs.view_team` (direct reports via managerId, §11.9); `scope=all`
 * needs `travelLogs.view_all` — same explicit-scope-per-permission-action
 * pattern as `leave.service.js#listLeaves`, not Location's implicit union.
 * `employeeId` (optional) narrows further within whatever the scope already
 * permits — e.g. a manager on `scope=team` filtering down to one report.
 * Ignored on `scope=own`, since that's already maximally narrow (self only).
 */
export async function listTravelLogs({ scope, employeeId, month }, requestingUser) {
  const resolvedScope = scope || "own";
  const filter = {};

  if (resolvedScope === "team") {
    if (!can(requestingUser, "travelLogs", "view_team")) {
      throw new ApiError(403, "You do not have permission to view your team's travel logs");
    }

    const teamMembers = await User.find({ managerId: requestingUser._id }).select("_id");
    const visibleIds = teamMembers.map((member) => String(member._id));

    filter.employeeId =
      employeeId && visibleIds.includes(String(employeeId)) ? employeeId : { $in: visibleIds };
  } else if (resolvedScope === "all") {
    if (!can(requestingUser, "travelLogs", "view_all")) {
      throw new ApiError(403, "You do not have permission to view all travel logs");
    }

    if (employeeId) {
      filter.employeeId = employeeId;
    }
  } else {
    if (!can(requestingUser, "travelLogs", "view")) {
      throw new ApiError(403, "You do not have permission to view travel logs");
    }

    filter.employeeId = requestingUser._id;
  }

  if (month) {
    const { start, end } = resolveMonthRange(month);
    filter.date = { $gte: start, $lt: end };
  }

  return TravelLog.find(filter).sort({ date: -1 });
}

async function resolveDirectReportIds(requestingUser) {
  const teamMembers = await User.find({ managerId: requestingUser._id }).select("_id");

  return teamMembers.map((member) => member._id);
}

/**
 * Report scoping mirrors Attendance's `generateAttendanceReport` exactly —
 * gated by `travelLogs.view_team`/`view_all` at the route (authorizeAny), not
 * an explicit `?scope=`; `view_all` sees everyone, otherwise direct reports
 * only. Reuses `src/services/report.service.js`'s generic builders rather
 * than writing new PDF/Excel generation code.
 */
export async function generateTravelLogReport({ from, to, format }, requestingUser) {
  const employeeFilter = can(requestingUser, "travelLogs", "view_all")
    ? {}
    : { employeeId: { $in: await resolveDirectReportIds(requestingUser) } };

  const dateFilter = {};

  if (from) {
    dateFilter.$gte = new Date(from);
  }

  if (to) {
    dateFilter.$lt = addOneDay(new Date(to));
  }

  const filter = { ...employeeFilter };

  if (Object.keys(dateFilter).length > 0) {
    filter.date = dateFilter;
  }

  const records = await TravelLog.find(filter).sort({ date: 1 }).populate("employeeId", "name");
  const subtitle = from || to ? `${from || "…"} to ${to || "…"}` : undefined;

  return format === "pdf" ? buildPdfReport(records, subtitle) : buildXlsxReport(records);
}

function addOneDay(date) {
  const next = new Date(date);
  next.setDate(next.getDate() + 1);

  return next;
}

// A record whose `employeeId` didn't populate is a genuinely unresolvable
// reference (a hard-deleted user — `user.service.js#hardDeleteUser`
// deliberately doesn't cascade-fix-up other records' references, by
// design), not a broken lookup — this populate call is the same pattern
// used everywhere else. Labeled distinctly from "Unknown" so a report
// reader can tell "this was a deliberate, audited deletion" from "something
// went wrong generating this report" (§7.11's Reports PDF fix, 2026-08-04).
const DELETED_USER_LABEL = "[Deleted User]";

// One row shape feeds both `generateExcelReport` and `generatePdfReport`
// (2026-08-04) — previously each format re-derived its own row text
// independently, which is how the two ended up with the same
// employee-name fallback bug in two separate places instead of one.
function buildTravelLogRows(records) {
  return records.map((record) => ({
    employee: record.employeeId?.name || DELETED_USER_LABEL,
    date: record.date,
    distanceKm: record.distanceKm,
    source: record.source,
  }));
}

function buildXlsxReport(records) {
  return generateExcelReport({
    sheetName: "Travel Logs",
    columns: [
      { header: "Employee", key: "employee", width: 25 },
      { header: "Date", key: "date", width: 15 },
      { header: "Distance (km)", key: "distanceKm", width: 15 },
      { header: "Source", key: "source", width: 12 },
    ],
    rows: buildTravelLogRows(records),
  });
}

function buildPdfReport(records, subtitle) {
  return generatePdfReport({
    title: "Travel Log Report",
    subtitle,
    columns: [
      { header: "Employee", key: "employee", width: 2 },
      { header: "Date", key: "date", width: 1.2 },
      { header: "Distance (km)", key: "distanceKm", width: 1.2 },
      { header: "Source", key: "source", width: 1 },
    ],
    rows: buildTravelLogRows(records),
  });
}

function resolveMonthRange(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  const start = new Date(year, monthNumber - 1, 1);
  const end = new Date(year, monthNumber, 1);

  return { start, end };
}
