import ApiError from "../../utils/ApiError.js";
import { can } from "../../helpers/permission.helper.js";
import { env } from "../../config/env.js";
import { uploadAttendancePhoto, deleteCloudinaryAsset } from "../../services/cloudinary.service.js";
import { generateExcelReport, generatePdfReport, excludeInactiveOrDeletedRefs } from "../../services/report.service.js";
import { haversineDistanceMeters } from "../../services/geo.service.js";
import { generateAutoTravelLog } from "../transport/travelLog.service.js";
import { createNotification } from "../notification/notification.service.js";
import Attendance from "./attendance.model.js";
import User from "../user/user.model.js";
import Payroll from "../payroll/payroll.model.js";
import AttendanceRetentionLog from "./attendanceRetentionLog.model.js";

/**
 * Opens a new attendance record for "now". Rejects (403) if the requesting
 * user is an admin — admin accounts don't track attendance at all (2026-07-31,
 * §7.4c); enforced here server-side rather than just hiding the widget on the
 * frontend, since a frontend-only exemption is trivially bypassed by anyone
 * hitting this endpoint directly. Rejects (409) if the employee already has
 * an OPEN record (checked in, not yet checked out) — one open check-in at a
 * time, reused as-is (no date scoping) from
 * location.service.js#findOpenAttendance,
 * since "open" already implies "not yet closed," regardless of which day it
 * started on. `photo` is uploaded to Cloudinary — never stored as binary in
 * MongoDB (§6.5/§7.4). Mandatory server-side (attendance.validation.js
 * rejects a check-in/check-out with no photo at all) — the whole point of
 * capturing one is to prove physical presence, which isn't actually enforced
 * if the API will silently accept a request without it.
 *
 * Notifies (§7.4c) the employee themselves, their manager (if any), and every
 * admin — see `notifyAttendanceEvent` below. The RESPONSE returned to the
 * caller has its own photo/coords stripped before it goes back (see
 * `applyVisibilityRules`) — the employee is viewing their own just-created
 * record, and "employee never sees own photo/location" is a blanket rule
 * (§7.4c) with no carve-out for the instant they submit it; the frontend
 * already has both locally anyway, from its own camera/geolocation capture.
 */
export async function checkIn(requestingUser, coords, photo) {
  if (requestingUser.role === "admin") {
    throw new ApiError(403, "Admin accounts do not track attendance");
  }

  const employeeId = requestingUser._id;
  const openRecord = await findOpenAttendance(employeeId);

  if (openRecord) {
    throw new ApiError(409, "You are already checked in — check out before checking in again.");
  }

  const now = new Date();
  const upload = photo ? await uploadAttendancePhoto(photo) : null;

  const record = await Attendance.create({
    employeeId,
    date: startOfDay(now),
    checkIn: { time: now, coords, photoUrl: upload?.secureUrl || null, photoPublicId: upload?.publicId || null },
    // The check-in moment itself counts as the first "proof of life" —
    // see applyConnectivityGapIfNeeded.
    lastHeartbeatAt: now,
  });

  await notifyAttendanceEvent(requestingUser, "attendance_check_in", `${requestingUser.name} checked in`, record._id);

  return applyVisibilityRules(record, SELF_VIEW_VISIBILITY);
}

/**
 * Closes the employee's current open attendance record. Rejects (409) if
 * there's no open record — nothing to check out of. ALSO rejects (409,
 * 2026-07-31 §7.4c) if the employee is still on break (`breakIn` set,
 * `breakOut` not) — chosen over auto-closing the break silently, since a
 * checkout that quietly ends a break the employee forgot about would hide a
 * real state transition from them; a clear "end your break first" message is
 * safer and unambiguous. Runs the same connectivity-gap check a heartbeat
 * would (covering any silent period between the last heartbeat and
 * checkout), then computes workingHours.
 *
 * Also auto-generates a `TravelLog` (§6.5/§7.6) from this shift's checkIn →
 * checkOut coords — a direct call into `transport/travelLog.service.js`
 * rather than duplicating any of the checkout logic above. That function is
 * guaranteed to never throw (missing coords or a Google Maps failure just
 * mean no log gets created), so checkout itself can never fail because
 * travel logging failed.
 */
export async function checkOut(requestingUser, coords, photo) {
  const employeeId = requestingUser._id;
  const openRecord = await findOpenAttendance(employeeId);

  if (!openRecord) {
    throw new ApiError(409, "No open check-in found — check in before checking out.");
  }

  if (openRecord.breakIn?.time && !openRecord.breakOut?.time) {
    throw new ApiError(409, "You're still on break — end your break before checking out.");
  }

  const now = new Date();
  applyConnectivityGapIfNeeded(openRecord, now);
  closeOpenGeofenceViolation(openRecord, now);

  const upload = photo ? await uploadAttendancePhoto(photo) : null;
  openRecord.checkOut = {
    time: now,
    coords,
    photoUrl: upload?.secureUrl || null,
    photoPublicId: upload?.publicId || null,
  };
  openRecord.workingHours = computeWorkingHours(
    openRecord.checkIn.time,
    now,
    openRecord.connectivityGaps,
    breakDurationMs(openRecord)
  );

  await openRecord.save();

  await generateAutoTravelLog({
    employeeId,
    date: openRecord.date,
    originCoords: openRecord.checkIn.coords,
    destinationCoords: openRecord.checkOut.coords,
  });

  await notifyAttendanceEvent(requestingUser, "attendance_check_out", `${requestingUser.name} checked out`, openRecord._id);

  return applyVisibilityRules(openRecord, SELF_VIEW_VISIBILITY);
}

/**
 * Break In — only valid while checked in, not already on break, and the
 * shift's one break hasn't already been used (§7.4c: single break per shift,
 * not an array). No photo requirement (confirmed decision) — `coords` IS
 * required, matching check-in's own geolocation requirement, enforced in
 * attendance.validation.js.
 */
export async function breakIn(requestingUser, coords) {
  const employeeId = requestingUser._id;
  const openRecord = await findOpenAttendance(employeeId);

  if (!openRecord) {
    throw new ApiError(409, "No open check-in found — check in before starting a break.");
  }

  if (openRecord.breakIn?.time && !openRecord.breakOut?.time) {
    throw new ApiError(409, "You're already on break.");
  }

  if (openRecord.breakIn?.time && openRecord.breakOut?.time) {
    throw new ApiError(409, "You've already used your one break for this shift.");
  }

  const now = new Date();
  openRecord.breakIn = { time: now, coords };
  await openRecord.save();

  await notifyAttendanceEvent(requestingUser, "attendance_break_in", `${requestingUser.name} started a break`, openRecord._id);

  return applyVisibilityRules(openRecord, SELF_VIEW_VISIBILITY);
}

/**
 * Break Out — only valid while genuinely on break (`breakIn` set,
 * `breakOut` not yet). See `checkOut` above for what happens if checkout is
 * attempted before this is called.
 */
export async function breakOut(requestingUser, coords) {
  const employeeId = requestingUser._id;
  const openRecord = await findOpenAttendance(employeeId);

  if (!openRecord) {
    throw new ApiError(409, "No open check-in found.");
  }

  if (!openRecord.breakIn?.time || openRecord.breakOut?.time) {
    throw new ApiError(409, "You're not currently on break.");
  }

  const now = new Date();
  openRecord.breakOut = { time: now, coords };
  await openRecord.save();

  await notifyAttendanceEvent(requestingUser, "attendance_break_out", `${requestingUser.name} ended their break`, openRecord._id);

  return applyVisibilityRules(openRecord, SELF_VIEW_VISIBILITY);
}

/**
 * Total break duration in ms for this shift — 0 if no break was taken (or
 * the break was started but never ended, which `checkOut` above already
 * rejects before this could ever be called with an open break).
 */
function breakDurationMs(attendance) {
  if (!attendance.breakIn?.time || !attendance.breakOut?.time) {
    return 0;
  }

  return attendance.breakOut.time - attendance.breakIn.time;
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
 * Geofencing (added later, §6.5/§7.4) — flags when an employee's GPS
 * location moves beyond GEOFENCE_RADIUS_METERS from their check-in point
 * during a shift. Called from `location.service.js#submitPing` on every
 * ping, mirroring how that module already calls straight into this one's
 * `Attendance` model for its "is there an open shift" check — a
 * cross-module direct call, not a duplicated implementation.
 *
 * Same violation-window shape as connectivity-gap detection, but live
 * rather than retroactive: a ping stream arrives in real time, so a
 * violation opens the moment a ping first lands outside the radius (not
 * discovered after the fact) and stays open — updating `maxDistanceMeters`
 * to the worst distance seen — until a later in-radius ping closes it, or
 * `closeOpenGeofenceViolation` below force-closes it at checkout. `checkIn.
 * coords` (§6.5, already stored on every real check-in) is reused directly
 * as this shift's geofence center — no separate storage needed. Distance is
 * straight-line only (`geo.service.js`'s Haversine formula, not Google
 * Maps' driving-distance API) — a real-time per-ping radius check doesn't
 * need routing, and depending on an external API here would mean a ping
 * starts failing/blocking whenever that API is unavailable.
 *
 * Wraps its entire body in try/catch and always resolves — geofencing must
 * NEVER block or fail the location ping itself, the same "never block the
 * primary action" principle `travelLog.service.js#generateAutoTravelLog`
 * already established for Attendance checkout. The ping document itself
 * (already created by the caller before this runs) is never affected by a
 * failure in here.
 */
export async function applyGeofenceCheck(attendance, coords, now) {
  try {
    const checkInCoords = attendance.checkIn?.coords;

    if (checkInCoords?.lat == null || checkInCoords?.lng == null) {
      return;
    }

    const distance = haversineDistanceMeters(checkInCoords, coords);
    const radiusMeters = Number(env.geofenceRadiusMeters);
    const openViolation = attendance.geofenceViolations.find((violation) => !violation.end);

    if (distance > radiusMeters) {
      if (openViolation) {
        openViolation.maxDistanceMeters = Math.max(openViolation.maxDistanceMeters, distance);
      } else {
        attendance.geofenceViolations.push({ start: now, end: null, maxDistanceMeters: distance });
      }
    } else if (openViolation) {
      openViolation.end = now;
    }

    await attendance.save();
  } catch (error) {
    // Never block the ping — see this function's own docstring.
  }
}

/**
 * Force-closes a still-open geofence violation at checkout — the "or at
 * checkout, whichever comes first" half of the violation-window design
 * above. In-memory only (no separate `.save()`) — `checkOut` already saves
 * the record once after this runs, the same way it already does for
 * `applyConnectivityGapIfNeeded`. Wrapped in try/catch for the same
 * never-block-checkout guarantee.
 */
function closeOpenGeofenceViolation(attendance, now) {
  try {
    const openViolation = attendance.geofenceViolations.find((violation) => !violation.end);

    if (openViolation) {
      openViolation.end = now;
    }
  } catch (error) {
    // Never block checkout.
  }
}

/**
 * workingHours = gross shift duration MINUS total connectivity-gap duration
 * MINUS break duration (§7.4c, 2026-07-31 addition) — a gap means the
 * employee wasn't verifiably working during that window, and a break is time
 * they were deliberately not working, so neither should count toward their
 * hours (§6.5/§7.4, this task's own stated reasoning). `breakMs` defaults to
 * 0 so every OTHER existing caller (createManualAttendance, which has no
 * break concept at all) is unaffected. Clamped to 0 in the pathological case
 * where gaps+break somehow exceed the gross duration. Rounded to 2 decimal
 * places (hours).
 */
function computeWorkingHours(checkInTime, checkOutTime, connectivityGaps, breakMs = 0) {
  const grossMs = checkOutTime - checkInTime;
  const gapMs = connectivityGaps.reduce((total, gap) => total + (gap.end - gap.start), 0);
  const netMs = Math.max(0, grossMs - gapMs - breakMs);

  return Math.round((netMs / 3600000) * 100) / 100;
}

/**
 * Own attendance history, newest first, optionally narrowed to a single
 * calendar month (`month` as "YYYY-MM"). Photo/coords are ALWAYS stripped
 * here (§7.4c) — viewing your own record is a hard no-override case, not
 * permission-gated, regardless of the viewer's own role/grants (even a
 * manager or admin viewing THEIR OWN history via this same endpoint gets the
 * same stripped shape).
 */
export async function getMyAttendance(employeeId, month) {
  const filter = { employeeId };

  if (month) {
    const { start, end } = resolveMonthRange(month);
    filter.date = { $gte: start, $lt: end };
  }

  const records = await Attendance.find(filter).sort({ date: -1 });

  return records.map((record) => applyVisibilityRules(record, SELF_VIEW_VISIBILITY));
}

/**
 * `attendance.view_all` sees every employee's records; otherwise (view_team,
 * the route-level gate) direct reports only — same managerId-based "own
 * team" pattern as everywhere else (§11.9). Own attendance is always visible
 * via GET /attendance/me with no gate at all — this endpoint is specifically
 * for viewing OTHERS', so it's never reached without at least view_team.
 *
 * Photo/coords are gated per-viewer (§7.4c, 2026-07-31): admin always sees
 * both (`can()` bypasses for admin); a manager needs the specific
 * `attendance.view_photos`/`attendance.view_location` grant for each,
 * independently — a manager with neither sees plain check-in/check-out
 * times and nothing else.
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

  const records = await Attendance.find(filter).sort({ date: -1 });
  const visibility = viewerVisibility(requestingUser);

  return records.map((record) => applyVisibilityRules(record, visibility));
}

// Exported for `report/analytics.service.js`'s Attendance-trend endpoint to
// reuse directly, matching `getTeamAttendance`'s own org-wide/team scoping
// exactly rather than a second copy of this same manager-lookup query.
export async function resolveDirectReportIds(requestingUser) {
  const teamMembers = await User.find({ managerId: requestingUser._id }).select("_id");

  return teamMembers.map((member) => member._id);
}

const ADJUSTABLE_FIELDS = ["status"];

/**
 * Rejects a check-out at or before its check-in (2026-08-08).
 *
 * Self-service check-out can't produce this — it stamps `now` — but both admin
 * paths accept arbitrary times and nothing anywhere compared them. It stayed
 * invisible because `computeWorkingHours` clamps with `Math.max(0, ...)`, so
 * an inverted pair landed as `workingHours: 0`, indistinguishable from a
 * genuinely zero shift. The clamp is deliberately unchanged — a negative
 * `workingHours` would be worse than a clamped one — so the guard has to be on
 * the input.
 *
 * Equal times are rejected too: a zero-length shift is not a correction anyone
 * means to make, and it is exactly what an off-by-one or a copy-pasted
 * timestamp produces.
 *
 * Crossing midnight is NOT what this checks. An overnight shift (check in
 * 16:47, out 10:11 the next morning) is legitimate and must pass — the only
 * question asked here is ordering.
 */
function assertCheckOutAfterCheckIn(checkInTime, checkOutTime) {
  if (!checkInTime || !checkOutTime) {
    return;
  }

  if (new Date(checkOutTime).getTime() <= new Date(checkInTime).getTime()) {
    throw new ApiError(400, "check-out time must be after the check-in time.");
  }
}

/**
 * Admin-only correction of an existing record — `status`, `checkIn.time`,
 * `checkOut.time`. Route-level `requireAdmin` (attendance.routes.js) is the
 * real access gate; there's no `attendance.*` permission tier for this
 * (PERMISSION_REGISTRY's `attendance` only has `view_team`/`view_all`, no
 * edit action), matching how `POST /payroll/run` — the other genuinely
 * admin-only, no-tier action in this codebase — is gated.
 *
 * `workingHours` is recomputed via the exact same `computeWorkingHours`
 * formula real checkout uses, over the record's EXISTING `connectivityGaps`
 * (this edit doesn't touch gaps) — "recompute," not a new calculation, so a
 * manual time correction can't silently drift from how every other
 * `workingHours` value in the system was derived. If the edit leaves no
 * `checkOut.time` (e.g. it was explicitly cleared), `workingHours` reverts
 * to `null` — there's nothing to compute a duration against.
 *
 * Always sets `isManuallyAdjusted`/`adjustedBy`, even if only `status` was
 * touched — any admin-originated write to a record that used to be (or
 * still is) a real self-service check-in must be visibly flagged, not just
 * edits to the time fields specifically.
 */
export async function adjustAttendance(attendanceId, payload, requestingUser, options = {}) {
  const record = await Attendance.findById(attendanceId);

  if (!record) {
    throw new ApiError(404, "Attendance record not found");
  }

  // §7.4g (2026-08-09) — the today's-roster correction path passes
  // `manualRecordsOnly`, and it may only ever touch records that were
  // themselves marked by hand.
  //
  // The guard lives HERE, not in the roster UI, so it still holds if a future
  // UI change forgets: a device-captured record carries a photo, coordinates
  // and heartbeat data that cannot be reconstructed, and overwriting it from a
  // roster dropdown would destroy evidence payroll and geofence checks read.
  // `checkIn.time === null` is exactly what separates the two — every manual
  // mark leaves it null, every real check-in sets it.
  if (options.manualRecordsOnly && record.checkIn?.time) {
    throw new ApiError(
      409,
      "This day has a real check-in and cannot be changed from the roster — its photo and location data would be lost."
    );
  }

  ADJUSTABLE_FIELDS.forEach((field) => {
    if (payload[field] !== undefined) {
      record[field] = payload[field];
    }
  });

  if (payload.checkIn?.time !== undefined) {
    record.checkIn.time = payload.checkIn.time ? new Date(payload.checkIn.time) : null;
  }

  if (payload.checkOut?.time !== undefined) {
    record.checkOut.time = payload.checkOut.time ? new Date(payload.checkOut.time) : null;
  }

  // Compared against the MERGED record, not the payload: a patch carrying only
  // `checkOut.time` still has to be checked against the check-in already on
  // the record, which is the case a payload-only guard misses entirely.
  // Thrown before `save()`, so a rejected correction writes nothing at all.
  assertCheckOutAfterCheckIn(record.checkIn.time, record.checkOut.time);

  record.workingHours =
    record.checkIn.time && record.checkOut.time
      ? computeWorkingHours(record.checkIn.time, record.checkOut.time, record.connectivityGaps, breakDurationMs(record))
      : null;

  record.isManuallyAdjusted = true;
  record.adjustedBy = requestingUser._id;

  await record.save();

  return record;
}

/**
 * Admin-only creation of a record for an employee+date that has none (e.g.
 * marking someone present on a day they never checked in) — no photo/
 * geolocation, since this is an explicit override, not a self-service
 * check-in. Rejects (409) if a record already exists for this
 * employee+date; the correction path for an existing record is
 * `adjustAttendance` above, not a second create.
 *
 * `checkIn.time`/`checkOut.time` are both genuinely optional here (see the
 * model's own comment on why `checkIn.time` is no longer schema-required) —
 * e.g. marking a day `absent`/`on_leave` has no real check-in event to
 * record at all, and inventing one would misrepresent exactly the kind of
 * "verified presence" this system exists to track.
 */
export async function createManualAttendance(payload, requestingUser) {
  const { employeeId, date, status, checkIn, checkOut } = payload;

  const employee = await User.findById(employeeId);

  if (!employee) {
    throw new ApiError(404, "Employee not found");
  }

  const dayStart = startOfDay(new Date(date));
  const existing = await Attendance.findOne({ employeeId, date: dayStart });

  if (existing) {
    throw new ApiError(
      409,
      "An attendance record already exists for this employee on this date — edit it instead of creating a new one."
    );
  }

  const checkInTime = checkIn?.time ? new Date(checkIn.time) : null;
  const checkOutTime = checkOut?.time ? new Date(checkOut.time) : null;

  assertCheckOutAfterCheckIn(checkInTime, checkOutTime);

  const record = new Attendance({
    employeeId,
    date: dayStart,
    status: status || "present",
    checkIn: { time: checkInTime },
    checkOut: { time: checkOutTime },
    workingHours: checkInTime && checkOutTime ? computeWorkingHours(checkInTime, checkOutTime, []) : null,
    isManuallyAdjusted: true,
    adjustedBy: requestingUser._id,
  });

  await record.save();

  return record;
}

/**
 * Gap-filling only (2026-08-05) — creates an `absent`/`half_day` record for
 * an employee+date that currently has NO record at all.
 *
 * This is deliberately NOT a reversal of the read-only decision that removed
 * the attendance edit/delete UI (§7.4, see `backend/README.md`). The
 * distinction is the whole point: a day with a real check-in carries
 * verified evidence (photo, coordinates, timestamps) and stays immutable
 * through this path — `adjustAttendance` remains the only writer for an
 * existing record, and it is still admin-only and still unexposed in the UI.
 * A day with NO record carries no evidence to contradict, and leaving it
 * blank silently understates absences in payroll. So: create where nothing
 * exists, never touch what does.
 *
 * Scope mirrors every other "own team" action in this codebase (§11.9):
 * admin any employee, a manager only their own direct reports — resolved
 * here against the specific employee, since route middleware can't express
 * a per-record check. No photo/geolocation: there is no presence being
 * claimed, so there is nothing to evidence.
 */
export async function markAttendanceStatus(payload, requestingUser) {
  const { employeeId, date, status } = payload;

  const employee = await User.findById(employeeId);

  if (!employee) {
    throw new ApiError(404, "Employee not found");
  }

  if (requestingUser.role !== "admin") {
    if (String(employee.managerId) !== String(requestingUser._id)) {
      throw new ApiError(403, "You can only mark attendance for your own direct reports");
    }
  }

  const dayStart = startOfDay(new Date(date));
  const existing = await Attendance.findOne({ employeeId, date: dayStart });

  if (existing) {
    throw new ApiError(
      409,
      "This employee already has an attendance record for that date — only days with no record at all can be marked."
    );
  }

  const record = await Attendance.create({
    employeeId,
    date: dayStart,
    status,
    checkIn: { time: null },
    checkOut: { time: null },
    workingHours: null,
    isManuallyAdjusted: true,
    adjustedBy: requestingUser._id,
  });

  return record;
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

  const allRecords = await Attendance.find(filter).sort({ date: 1 }).populate("employeeId", "name isActive");
  // Report/export-only exclusion (§7.11, 2026-08-04) — a deleted/deactivated
  // employee's attendance history stays fully intact in the database and
  // still shows up in every other view; it's just left out of this
  // generated file. See excludeInactiveOrDeletedRefs' own docblock.
  const records = excludeInactiveOrDeletedRefs(allRecords, "employeeId");
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
function buildAttendanceReportRows(records) {
  return records.map((record) => ({
    employee: record.employeeId?.name || DELETED_USER_LABEL,
    date: record.date,
    checkIn: record.checkIn?.time || null,
    checkOut: record.checkOut?.time || null,
    workingHours: record.workingHours,
    gaps: record.connectivityGaps.length,
    status: record.status,
  }));
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
    rows: buildAttendanceReportRows(records),
  });
}

function buildPdfReport(records, subtitle) {
  return generatePdfReport({
    title: "Attendance Report",
    subtitle,
    columns: [
      { header: "Employee", key: "employee", width: 2 },
      { header: "Date", key: "date", width: 1.2 },
      { header: "Check-In", key: "checkIn", width: 1, format: "time" },
      { header: "Check-Out", key: "checkOut", width: 1, format: "time" },
      { header: "Hours", key: "workingHours", width: 0.9 },
      { header: "Gaps", key: "gaps", width: 0.7 },
      { header: "Status", key: "status", width: 1.1 },
    ],
    rows: buildAttendanceReportRows(records),
  });
}

/**
 * Visibility a viewer gets over SOMEONE ELSE's record (§7.4c) — never used
 * for self-viewing, which is always `SELF_VIEW_VISIBILITY` regardless of the
 * viewer's own grants. `can()` already returns `true` unconditionally for an
 * admin (permission.helper.js), so an admin viewer naturally gets both here
 * with no separate admin-specific branch needed.
 */
function viewerVisibility(requestingUser) {
  return {
    canSeePhotos: can(requestingUser, "attendance", "view_photos"),
    canSeeLocation: can(requestingUser, "attendance", "view_location"),
  };
}

// Always both false — viewing your OWN record (§7.4c's hard rule, no
// permission can ever override it) and the shape every check-in/check-out/
// break-in/break-out response is stripped through before it goes back to
// the employee who just performed the action.
const SELF_VIEW_VISIBILITY = { canSeePhotos: false, canSeeLocation: false };

/**
 * Strips `photoUrl` (both checkIn/checkOut) and `coords` (checkIn/checkOut/
 * breakIn/breakOut) from a record per the given visibility — never mutates
 * the original Mongoose document, works on a plain object copy so a caller
 * that still holds the original (e.g. `checkOut` re-using `openRecord` after
 * this runs) isn't affected. `photoPublicId` never reaches this at all
 * (schema `select: false`), so there's nothing to strip for it here.
 */
function applyVisibilityRules(record, { canSeePhotos, canSeeLocation }) {
  const obj = typeof record.toObject === "function" ? record.toObject() : { ...record };

  if (!canSeePhotos) {
    if (obj.checkIn) obj.checkIn = { ...obj.checkIn, photoUrl: null };
    if (obj.checkOut) obj.checkOut = { ...obj.checkOut, photoUrl: null };
  }

  if (!canSeeLocation) {
    if (obj.checkIn) obj.checkIn = { ...obj.checkIn, coords: null };
    if (obj.checkOut) obj.checkOut = { ...obj.checkOut, coords: null };
    if (obj.breakIn) obj.breakIn = { ...obj.breakIn, coords: null };
    if (obj.breakOut) obj.breakOut = { ...obj.breakOut, coords: null };
  }

  return obj;
}

/**
 * Notifies (§7.4c) three audiences for a check-in/break-in/break-out/check-
 * out event, same `createNotification` reuse pattern as Leads/Leave: the
 * employee themselves (a confirmation), their manager if `managerId` is set,
 * and every admin. Deduplicated via a `Set` (an admin who IS the employee's
 * manager, or the employee themselves being an admin — not possible today
 * since `checkIn` blocks admin entirely, but kept for robustness — only ever
 * gets one notification, not two/three). Never awaited for its own sake by
 * its callers beyond letting a genuine failure surface — `createNotification`
 * itself already never throws on a push-delivery failure, only a real
 * database error would propagate here, same as every other caller of it.
 */
async function notifyAttendanceEvent(employee, type, message, attendanceId) {
  const recipientIds = new Set([String(employee._id)]);

  if (employee.managerId) {
    recipientIds.add(String(employee.managerId));
  }

  const admins = await User.find({ role: "admin" }).select("_id");
  admins.forEach((admin) => recipientIds.add(String(admin._id)));

  await Promise.all(
    [...recipientIds].map((userId) =>
      createNotification(userId, type, message, { module: "attendance", id: attendanceId })
    )
  );
}

/**
 * 45-day Cloudinary photo cleanup (§7.4c, 2026-07-31) — called daily by
 * `src/cron/attendancePhotoCleanupCron.js`. Finds every Attendance record
 * older than 45 days (by its `date` field, not `createdAt` — `date` is the
 * shift's own calendar day, the meaningful "how old is this attendance"
 * measure) that still has a `photoUrl` set on `checkIn` or `checkOut`,
 * deletes the actual Cloudinary asset via its `photoPublicId`, then clears
 * both `photoUrl` and `photoPublicId` to `null` — nothing else on the record
 * is ever touched.
 *
 * Explicitly `.select("+checkIn.photoPublicId +checkOut.photoPublicId")` —
 * both fields are schema `select: false` (never meant to leak into a normal
 * API response), so this is the one legitimate place that needs them back.
 *
 * Resilient by design: one record's failure (a Cloudinary error, a missing
 * `photoPublicId` on an old record that pre-dates this field existing at
 * all) is caught, logged, and counted — never stops the batch, matching the
 * "never block on a single failure" principle already used elsewhere in this
 * codebase (e.g. `applyGeofenceCheck`/`generateAutoTravelLog`). A record with
 * a `photoUrl` but no stored `photoPublicId` (only possible for a photo
 * uploaded before this field existed) can't have its Cloudinary asset
 * identified for deletion — best effort still clears the local `photoUrl`
 * reference so the app stops pointing at a 45-day-old photo, but the
 * underlying asset itself is orphaned on Cloudinary in that one case, logged
 * as such rather than silently skipped.
 */
export async function cleanupOldAttendancePhotos(referenceDate = new Date()) {
  const cutoff = new Date(referenceDate);
  cutoff.setDate(cutoff.getDate() - 45);

  const records = await Attendance.find({
    date: { $lt: cutoff },
    $or: [{ "checkIn.photoUrl": { $ne: null } }, { "checkOut.photoUrl": { $ne: null } }],
  }).select("+checkIn.photoPublicId +checkOut.photoPublicId");

  let cleaned = 0;
  let failed = 0;

  for (const record of records) {
    try {
      await cleanupOneRecordsPhotos(record);
      cleaned += 1;
    } catch (error) {
      failed += 1;
      console.error(`[attendance photo cleanup] Failed to clean record ${record._id}:`, error);
    }
  }

  return { checked: records.length, cleaned, failed };
}

async function cleanupOneRecordsPhotos(record) {
  if (record.checkIn?.photoUrl) {
    if (record.checkIn.photoPublicId) {
      await deleteCloudinaryAsset(record.checkIn.photoPublicId);
    } else {
      console.warn(
        `[attendance photo cleanup] Record ${record._id} has checkIn.photoUrl but no photoPublicId — clearing the reference, but the Cloudinary asset itself can't be identified/deleted.`
      );
    }

    record.checkIn.photoUrl = null;
    record.checkIn.photoPublicId = null;
  }

  if (record.checkOut?.photoUrl) {
    if (record.checkOut.photoPublicId) {
      await deleteCloudinaryAsset(record.checkOut.photoPublicId);
    } else {
      console.warn(
        `[attendance photo cleanup] Record ${record._id} has checkOut.photoUrl but no photoPublicId — clearing the reference, but the Cloudinary asset itself can't be identified/deleted.`
      );
    }

    record.checkOut.photoUrl = null;
    record.checkOut.photoPublicId = null;
  }

  await record.save();
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

/**
 * Attendance data retention (§6.5, 2026-08-05) — deletes records older than
 * `ATTENDANCE_RETENTION_DAYS` (default 45) AND their Cloudinary photos.
 *
 * Distinct from `cleanupOldAttendancePhotos` above, which strips PHOTOS from
 * old records while keeping the row. This deletes the row itself, so at the
 * same threshold it supersedes that job; a record whose photos were already
 * stripped simply has nothing left to delete in Cloudinary and is handled
 * without special-casing.
 *
 * **Ordering is the whole design, per record:**
 *
 * 1. **Payroll guard.** Skip any record whose month has no `Payroll`
 *    document yet. Attendance is the input payroll is computed FROM —
 *    deleting it first would destroy the evidence behind a figure nobody
 *    has calculated yet, and there is no way to reconstruct it.
 * 2. **Cloudinary first.** Delete the check-in/check-out assets.
 * 3. **DB record last, and only if step 2 succeeded.** Deleting the row
 *    first would orphan the Cloudinary asset permanently: the `publicId`
 *    needed to find it again lives ONLY on that row. A failed asset
 *    deletion therefore leaves the record in place for the next run — the
 *    job is idempotent, so retrying is free and safe.
 *
 * Bounded to `batchLimit` records per invocation because this runs as a
 * serverless function with an execution-time limit. Running it repeatedly is
 * both safe and the intended way to work through a large backlog.
 */
export async function runAttendanceRetention({ referenceDate = new Date(), batchLimit = 200 } = {}) {
  const retentionDays = Number(env.attendanceRetentionDays) || 45;

  const cutoff = new Date(referenceDate);
  cutoff.setDate(cutoff.getDate() - retentionDays);

  const candidates = await Attendance.find({ date: { $lt: cutoff } })
    .sort({ date: 1 })
    .limit(batchLimit)
    .select("+checkIn.photoPublicId +checkOut.photoPublicId");

  let deletedCount = 0;
  let skippedNoPayrollCount = 0;
  let failedCount = 0;
  let deletedFrom = null;
  let deletedTo = null;

  // Payroll existence is per month/year and identical for every record in
  // that month, so it's resolved once per month rather than per record.
  const payrollExistsByMonthKey = new Map();

  for (const record of candidates) {
    try {
      const recordDate = new Date(record.date);
      const monthKey = `${recordDate.getFullYear()}-${recordDate.getMonth() + 1}`;

      if (!payrollExistsByMonthKey.has(monthKey)) {
        const exists = await Payroll.exists({
          year: recordDate.getFullYear(),
          month: recordDate.getMonth() + 1,
        });
        payrollExistsByMonthKey.set(monthKey, Boolean(exists));
      }

      if (!payrollExistsByMonthKey.get(monthKey)) {
        skippedNoPayrollCount += 1;
        continue;
      }

      // Step 2 — assets before the row. Any failure throws, which lands in
      // the catch below and deliberately leaves the record untouched.
      await deleteRecordPhotoAssets(record);

      // Step 3 — only now is the row safe to remove.
      await record.deleteOne();

      deletedCount += 1;
      if (!deletedFrom || recordDate < deletedFrom) deletedFrom = recordDate;
      if (!deletedTo || recordDate > deletedTo) deletedTo = recordDate;
    } catch (error) {
      failedCount += 1;
      console.error(
        `[attendance retention] Left record ${record._id} in place — its Cloudinary asset could not be deleted:`,
        error
      );
    }
  }

  const summary = {
    cutoffDate: cutoff,
    retentionDays,
    deletedFrom,
    deletedTo,
    deletedCount,
    skippedNoPayrollCount,
    failedCount,
    examinedCount: candidates.length,
    batchLimit,
  };

  await AttendanceRetentionLog.create(summary);

  return summary;
}

/**
 * Deletes both photo assets for a record. Throws if Cloudinary rejects a
 * deletion, which is what keeps the caller from removing the row. A record
 * with no `photoPublicId` (older data, or photos already stripped by
 * `cleanupOldAttendancePhotos`) has nothing to delete and passes through —
 * there is no asset left to orphan.
 */
async function deleteRecordPhotoAssets(record) {
  const publicIds = [record.checkIn?.photoPublicId, record.checkOut?.photoPublicId].filter(Boolean);

  for (const publicId of publicIds) {
    await deleteCloudinaryAsset(publicId);
  }
}
