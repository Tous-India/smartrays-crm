import ApiError from "../../utils/ApiError.js";
import { can } from "../../helpers/permission.helper.js";
import { env } from "../../config/env.js";
import LocationPing from "./location.model.js";
import Attendance from "../attendance/attendance.model.js";
import User from "../user/user.model.js";

/**
 * Records a location ping for the currently authenticated employee. employeeId
 * always comes from the session (req.user), never from the request body — a
 * client can never submit a ping on someone else's behalf.
 *
 * Only accepted while the employee has an open Attendance record (checked in,
 * not yet checked out) — this is the only thing that enforces "tracking only
 * happens during a shift" (§7.4b). No open record → reject with 409, not a
 * silent no-op, so a client polling every couple of minutes gets a clear
 * signal to stop.
 */
export async function submitPing({ coords, capturedAt }, requestingUser) {
  const openAttendance = await findOpenAttendance(requestingUser._id);

  if (!openAttendance) {
    throw new ApiError(409, "No active shift — check in before location tracking can start.");
  }

  const ping = await LocationPing.create({
    employeeId: requestingUser._id,
    attendanceId: openAttendance._id,
    coords,
    capturedAt,
  });

  return ping;
}

async function findOpenAttendance(employeeId) {
  return Attendance.findOne({
    employeeId,
    "checkIn.time": { $ne: null },
    "checkOut.time": null,
  });
}

/**
 * Latest ping per employee, restricted to employees who currently have an open
 * Attendance record — a ping from someone who's since checked out isn't "live."
 */
export async function getLiveLocations(requestingUser) {
  const visibleEmployeeIds = await resolveVisibleEmployeeIds(requestingUser);
  const employeeFilter = buildEmployeeFilter(visibleEmployeeIds);

  const openAttendanceRecords = await Attendance.find({
    ...employeeFilter,
    "checkIn.time": { $ne: null },
    "checkOut.time": null,
  });

  const liveLocations = await Promise.all(
    openAttendanceRecords.map((attendance) => buildLiveEntry(attendance))
  );

  return liveLocations.filter((entry) => entry !== null);
}

async function buildLiveEntry(attendance) {
  // Scoped to this specific open attendance record, not just the employee, so a
  // stale ping from a previous (already closed) shift never shows up as "live."
  const latestPing = await LocationPing.findOne({ attendanceId: attendance._id }).sort({
    capturedAt: -1,
  });

  if (!latestPing) {
    return null;
  }

  return {
    employeeId: attendance.employeeId,
    attendanceId: attendance._id,
    coords: latestPing.coords,
    capturedAt: latestPing.capturedAt,
  };
}

/**
 * One employee's full ping trail for a single calendar day, ordered oldest to
 * newest — shaped for a map polyline. employeeId defaults to the requester;
 * date defaults to today.
 */
export async function getLocationHistory({ employeeId, date }, requestingUser) {
  const targetEmployeeId = employeeId || requestingUser._id;

  await ensureEmployeeIsVisible(targetEmployeeId, requestingUser);

  const { startOfDay, startOfNextDay } = resolveDayRange(date);

  const pings = await LocationPing.find({
    employeeId: targetEmployeeId,
    capturedAt: { $gte: startOfDay, $lt: startOfNextDay },
  }).sort({ capturedAt: 1 });

  return pings;
}

function resolveDayRange(dateInput) {
  const targetDate = dateInput ? new Date(dateInput) : new Date();
  const startOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
  const startOfNextDay = new Date(startOfDay);
  startOfNextDay.setDate(startOfNextDay.getDate() + 1);

  return { startOfDay, startOfNextDay };
}

/**
 * Resolves which employeeIds the requesting user is allowed to see, by
 * unioning every location permission they actually hold (§7.4b — a user can
 * hold more than one of view/view_team/view_all at once, e.g. an admin
 * override on top of a role default). Returns null to mean "no filter, see
 * everyone" (admin or view_all). Throws 403 if the user holds none of the
 * three permissions at all.
 */
async function resolveVisibleEmployeeIds(requestingUser) {
  if (can(requestingUser, "location", "view_all")) {
    return null;
  }

  const visibleIds = new Set();

  if (can(requestingUser, "location", "view_team")) {
    const teamMembers = await User.find({ managerId: requestingUser._id }).select("_id");
    teamMembers.forEach((member) => visibleIds.add(String(member._id)));
  }

  if (can(requestingUser, "location", "view")) {
    visibleIds.add(String(requestingUser._id));
  }

  if (visibleIds.size === 0) {
    throw new ApiError(403, "You do not have permission to view location data");
  }

  return Array.from(visibleIds);
}

function buildEmployeeFilter(visibleEmployeeIds) {
  if (visibleEmployeeIds === null) {
    return {};
  }

  return { employeeId: { $in: visibleEmployeeIds } };
}

/**
 * 404 (not 403) for an out-of-scope employeeId — matching the precedent set
 * in the Leads module (§7.1): a user who can't see someone's data also can't
 * tell whether that person's data exists.
 */
async function ensureEmployeeIsVisible(targetEmployeeId, requestingUser) {
  const visibleEmployeeIds = await resolveVisibleEmployeeIds(requestingUser);

  if (visibleEmployeeIds === null) {
    return;
  }

  const isVisible = visibleEmployeeIds.some((id) => id === String(targetEmployeeId));

  if (!isVisible) {
    throw new ApiError(404, "Employee not found");
  }
}

/**
 * The interval the client should use to schedule its own ping loop, so
 * changing the cadence never requires a client redeploy (§7.4b).
 */
export function getPingIntervalConfig() {
  return { pingIntervalMinutes: Number(env.locationPingIntervalMinutes) };
}
