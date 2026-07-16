import ApiError from "../../utils/ApiError.js";
import { can } from "../../helpers/permission.helper.js";
import { env } from "../../config/env.js";
import { uploadAttendancePhoto } from "../../services/cloudinary.service.js";
import { generateExcelReport, generatePdfReport } from "../../services/report.service.js";
import { generateAutoTravelLog } from "../transport/travelLog.service.js";
import Attendance from "./attendance.model.js";
import User from "../user/user.model.js";

/**
 * Opens a new attendance record for "now". Rejects (409) if the employee
 * already has an OPEN record (checked in, not yet checked out) — one open
 * check-in at a time, the same server-side "reject the second one" pattern
 * used for the one-`in_progress`-Task-per-employee constraint (§6.4) and
 * reused as-is (no date scoping) from location.service.js#findOpenAttendance,
 * since "open" already implies "not yet closed," regardless of which day it
 * started on. `photo` is uploaded to Cloudinary — never stored as binary in
 * MongoDB (§6.5/§7.4). Mandatory server-side (attendance.validation.js
 * rejects a check-in/check-out with no photo at all) — the whole point of
 * capturing one is to prove physical presence, which isn't actually enforced
 * if the API will silently accept a request without it.
 */
export async function checkIn(employeeId, coords, photo) {
  const openRecord = await findOpenAttendance(employeeId);

  if (openRecord) {
    throw new ApiError(409, "You are already checked in — check out before checking in again.");
  }

  const now = new Date();
  const photoUrl = photo ? await uploadAttendancePhoto(photo) : null;

  return Attendance.create({
    employeeId,
    date: startOfDay(now),
    checkIn: { time: now, coords, photoUrl },
    // The check-in moment itself counts as the first "proof of life" —
    // see applyConnectivityGapIfNeeded.
    lastHeartbeatAt: now,
  });
}

/**
 * Closes the employee's current open attendance record. Rejects (409) if
 * there's no open record — nothing to check out of. Runs the same
 * connectivity-gap check a heartbeat would (covering any silent period
 * between the last heartbeat and checkout), then computes workingHours.
 *
 * Also auto-generates a `TravelLog` (§6.5/§7.6) from this shift's checkIn →
 * checkOut coords — a direct call into `transport/travelLog.service.js`
 * rather than duplicating any of the checkout logic above. That function is
 * guaranteed to never throw (missing coords or a Google Maps failure just
 * mean no log gets created), so checkout itself can never fail because
 * travel logging failed.
 */
export async function checkOut(employeeId, coords, photo) {
  const openRecord = await findOpenAttendance(employeeId);

  if (!openRecord) {
    throw new ApiError(409, "No open check-in found — check in before checking out.");
  }

  const now = new Date();
  applyConnectivityGapIfNeeded(openRecord, now);

  const photoUrl = photo ? await uploadAttendancePhoto(photo) : null;
  openRecord.checkOut = { time: now, coords, photoUrl };
  openRecord.workingHours = computeWorkingHours(openRecord.checkIn.time, now, openRecord.connectivityGaps);

  await openRecord.save();

  await generateAutoTravelLog({
    employeeId,
    date: openRecord.date,
    originCoords: openRecord.checkIn.coords,
    destinationCoords: openRecord.checkOut.coords,
  });

  return openRecord;
}

/**
 * Connectivity-gap detection (§6.5 — "if network issue/logout during shift,
 * ... mark red"). Design: the client calls POST /attendance/heartbeat
 * periodically while checked in, as a distinct concern from Location's GPS
 * ping cadence (deliberately not reused/coupled — a heartbeat here proves
 * only "the session is alive," carries no coords, and exists purely for gap
 * detection). A gap can only ever be detected retroactively, at whichever of
 * the next heartbeat or checkout arrives first: if more time has passed
 * since the last recorded "proof of life" (a prior heartbeat, or check-in
 * itself if this is the first one) than ATTENDANCE_GAP_THRESHOLD_MINUTES,
 * the entire silent window is recorded as one connectivityGaps entry
 * `{ start: <last proof of life>, end: <now> }`. This is the only
 * server-observable signal of "network issue/logout" — the server has no
 * way to know a client went offline until it hears from it again (or the
 * shift ends without ever hearing from it again).
 */
function applyConnectivityGapIfNeeded(attendance, now) {
  const referenceTime = attendance.lastHeartbeatAt || attendance.checkIn.time;
  const elapsedMinutes = (now - referenceTime) / 60000;

  if (elapsedMinutes > Number(env.attendanceGapThresholdMinutes)) {
    attendance.connectivityGaps.push({ start: referenceTime, end: now });
  }

  attendance.lastHeartbeatAt = now;
}

/**
 * Records a "still alive" signal for the employee's open shift, applying the
 * same gap-detection check described above. Rejects (409) if there's no open
 * shift to heartbeat against.
 */
export async function recordHeartbeat(employeeId) {
  const openRecord = await findOpenAttendance(employeeId);

  if (!openRecord) {
    throw new ApiError(409, "No open check-in found — heartbeats are only accepted during an open shift.");
  }

  applyConnectivityGapIfNeeded(openRecord, new Date());
  await openRecord.save();

  return openRecord;
}

/**
 * workingHours = gross shift duration MINUS total connectivity-gap duration
 * — a gap means the employee wasn't verifiably working during that window,
 * so it shouldn't count toward their hours (§6.5/§7.4, this task's own
 * stated reasoning). Clamped to 0 in the pathological case where gaps somehow
 * exceed the gross duration. Rounded to 2 decimal places (hours).
 */
function computeWorkingHours(checkInTime, checkOutTime, connectivityGaps) {
  const grossMs = checkOutTime - checkInTime;
  const gapMs = connectivityGaps.reduce((total, gap) => total + (gap.end - gap.start), 0);
  const netMs = Math.max(0, grossMs - gapMs);

  return Math.round((netMs / 3600000) * 100) / 100;
}

/**
 * Own attendance history, newest first, optionally narrowed to a single
 * calendar month (`month` as "YYYY-MM").
 */
export async function getMyAttendance(employeeId, month) {
  const filter = { employeeId };

  if (month) {
    const { start, end } = resolveMonthRange(month);
    filter.date = { $gte: start, $lt: end };
  }

  return Attendance.find(filter).sort({ date: -1 });
}

/**
 * `attendance.view_all` sees every employee's records; otherwise (view_team,
 * the route-level gate) direct reports only — same managerId-based "own
 * team" pattern as everywhere else (§11.9). Own attendance is always visible
 * via GET /attendance/me with no gate at all — this endpoint is specifically
 * for viewing OTHERS', so it's never reached without at least view_team.
 */
export async function getTeamAttendance(month, requestingUser) {
  const employeeFilter = can(requestingUser, "attendance", "view_all")
    ? {}
    : { employeeId: { $in: await resolveDirectReportIds(requestingUser) } };

  const filter = { ...employeeFilter };

  if (month) {
    const { start, end } = resolveMonthRange(month);
    filter.date = { $gte: start, $lt: end };
  }

  return Attendance.find(filter).sort({ date: -1 });
}

async function resolveDirectReportIds(requestingUser) {
  const teamMembers = await User.find({ managerId: requestingUser._id }).select("_id");

  return teamMembers.map((member) => member._id);
}

/**
 * Same visible-employee scoping as getTeamAttendance, filtered further by an
 * optional [from, to] date range (inclusive) instead of a single month.
 */
export async function generateAttendanceReport({ from, to, format }, requestingUser) {
  const employeeFilter = can(requestingUser, "attendance", "view_all")
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

  const records = await Attendance.find(filter).sort({ date: 1 }).populate("employeeId", "name");

  return format === "pdf" ? buildPdfReport(records) : buildXlsxReport(records);
}

function addOneDay(date) {
  const next = new Date(date);
  next.setDate(next.getDate() + 1);

  return next;
}

function buildXlsxReport(records) {
  return generateExcelReport({
    sheetName: "Attendance",
    columns: [
      { header: "Employee", key: "employee", width: 25 },
      { header: "Date", key: "date", width: 15 },
      { header: "Check-In", key: "checkIn", width: 22 },
      { header: "Check-Out", key: "checkOut", width: 22 },
      { header: "Working Hours", key: "workingHours", width: 15 },
      { header: "Connectivity Gaps", key: "gaps", width: 18 },
      { header: "Status", key: "status", width: 14 },
    ],
    rows: records.map((record) => ({
      employee: record.employeeId?.name || "Unknown",
      date: record.date,
      checkIn: record.checkIn?.time || null,
      checkOut: record.checkOut?.time || null,
      workingHours: record.workingHours,
      gaps: record.connectivityGaps.length,
      status: record.status,
    })),
  });
}

function buildPdfReport(records) {
  return generatePdfReport({
    title: "Attendance Report",
    rows: records,
    formatRow: (record) => {
      const employeeName = record.employeeId?.name || "Unknown";
      const checkInTime = record.checkIn?.time ? record.checkIn.time.toISOString() : "-";
      const checkOutTime = record.checkOut?.time ? record.checkOut.time.toISOString() : "-";
      const workingHours = record.workingHours != null ? record.workingHours.toFixed(2) : "-";

      return (
        `${employeeName} | ${record.date.toDateString()} | In: ${checkInTime} | Out: ${checkOutTime} | ` +
        `Hours: ${workingHours} | Gaps: ${record.connectivityGaps.length} | Status: ${record.status}`
      );
    },
  });
}

function findOpenAttendance(employeeId) {
  return Attendance.findOne({
    employeeId,
    "checkIn.time": { $ne: null },
    "checkOut.time": null,
  });
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function resolveMonthRange(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  const start = new Date(year, monthNumber - 1, 1);
  const end = new Date(year, monthNumber, 1);

  return { start, end };
}
