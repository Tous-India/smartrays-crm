import ApiError from "../../utils/ApiError.js";
import { can } from "../../helpers/permission.helper.js";
import { env } from "../../config/env.js";
import { applyGeofenceCheck } from "../attendance/attendance.service.js";
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
 *
 * Also runs geofence detection (§6.5/§7.4, added later) against this same
 * open Attendance record — a direct call into `attendance.service.js`
 * (already imported here for `findOpenAttendance` below) rather than
 * duplicating gap-window logic in this module. `applyGeofenceCheck` is
 * guaranteed to never throw, so it's called after the ping is already
 * created and never affects this endpoint's response.
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

  await applyGeofenceCheck(openAttendance, coords, new Date(capturedAt));

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
 * Who is on shift right now, split into the two states that used to be one
 * (§7.69).
 *
 * `entries` are employees with at least one ping — the map layer, unchanged.
 * `unlocatable` are employees with an OPEN shift and ZERO pings for it: on the
 * clock and not reporting a position at all.
 *
 * Those two were previously indistinguishable. `buildLiveEntry` returns null
 * for a pingless shift and the caller filtered nulls away, so the response was
 * `[]` both when nobody was working and when somebody was working and could not
 * be located. The frontend then rendered one calm message for both. The server
 * knew the difference at the moment it discarded it.
 *
 * `unlocatable` deliberately carries NO coordinates and NO photo — only who and
 * for how long. The employee's check-in position is on the Attendance record
 * and could have been included, but releasing it here would route location data
 * around `applyVisibilityRules` and the `attendance.view_location` grant that
 * governs it. A warning list does not need a position; it needs a name and a
 * duration.
 *
 * Naming is already scoped: `resolveVisibleEmployeeIds` decides whose shifts
 * are considered at all, so a manager can only ever name their own team.
 */
export async function getLiveLocations(requestingUser) {
  const visibleEmployeeIds = await resolveVisibleEmployeeIds(requestingUser);
  const employeeFilter = buildEmployeeFilter(visibleEmployeeIds);

  const openAttendanceRecords = await Attendance.find({
    ...employeeFilter,
    "checkIn.time": { $ne: null },
    "checkOut.time": null,
  });

  const built = await Promise.all(
    openAttendanceRecords.map(async (attendance) => ({
      attendance,
      entry: await buildLiveEntry(attendance),
    }))
  );

  const entries = built.filter((one) => one.entry !== null).map((one) => one.entry);
  const silent = built.filter((one) => one.entry === null).map((one) => one.attendance);

  return {
    entries,
    unlocatable: await describeUnlocatable(silent),
    // The denominator behind both numbers, so a reader can tell "nobody is
    // working" from "everybody working is reporting".
    openShiftCount: openAttendanceRecords.length,
  };
}

/**
 * Names the silent shifts and says how long each has been silent.
 *
 * "2 employees have no location data" tells an admin something is wrong.
 * "Ramesh, silent 3h 07m" tells them who to call and how worried to be — a
 * shift that started ninety seconds ago has simply not reached its first ping
 * yet, which is normal, while three hours of silence is not.
 */
async function describeUnlocatable(attendances) {
  if (attendances.length === 0) {
    return [];
  }

  const employees = await User.find({
    _id: { $in: attendances.map((attendance) => attendance.employeeId) },
  }).select("_id name");

  const nameById = new Map(employees.map((employee) => [String(employee._id), employee.name]));
  const now = Date.now();

  return attendances
    .map((attendance) => ({
      employeeId: attendance.employeeId,
      attendanceId: attendance._id,
      // A visible employee whose User record is missing is still reported —
      // omitting them would hide the very thing this list exists to surface.
      name: nameById.get(String(attendance.employeeId)) || "Unknown employee",
      checkInAt: attendance.checkIn.time,
      silentForMinutes: Math.max(0, Math.round((now - new Date(attendance.checkIn.time).getTime()) / 60000)),
    }))
    .sort((a, b) => b.silentForMinutes - a.silentForMinutes);
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
 * The history window is capped at 45 DAYS, server-side, regardless of what the
 * client asks for (§7.67).
 *
 * `LocationPing` already TTL-purges at 45 days, so a trail older than that does
 * not exist. `Attendance.checkIn/checkOut.coords` have NO TTL and persist
 * forever — so without this cap the two halves of the same view would disagree
 * about how far back history goes, and an endpoint from a year ago would appear
 * with no possible trail beside it. One rule, applied to both.
 */
export const HISTORY_MAX_DAYS = 45;

function resolveRange({ from, to }) {
  const now = new Date();
  const earliest = new Date(now.getTime() - HISTORY_MAX_DAYS * 24 * 60 * 60 * 1000);

  const requestedFrom = from ? new Date(from) : earliest;
  const requestedTo = to ? new Date(to) : now;

  // The cap is a clamp, not a rejection: asking for a year returns 45 days
  // rather than a 400, and the response says so.
  const start = requestedFrom < earliest ? earliest : requestedFrom;
  // Only the FLOOR is clamped. Clamping the end to `now` would silently drop
  // the rest of today from a single-day query — asking for "25 August" must
  // mean the whole of it, not "up to this moment".
  const end = requestedTo;

  return {
    start,
    end,
    capped: requestedFrom < earliest,
  };
}

/**
 * Location history for one or many employees over a date range (§7.67).
 *
 * Returns BOTH halves of the picture in one response, because they come from
 * two collections but are one view: `endpoints` (check-in/check-out positions,
 * from Attendance) and `pings` (the trail, from LocationPing). A parallel
 * endpoint for the Attendance half would have needed its own scoping, and the
 * two would have drifted.
 *
 * TRAILS ARE REFUSED FOR MULTI-EMPLOYEE REQUESTS, server-side. At the observed
 * 2-minute cadence one employee generates ~240 pings per 8-hour day, so twenty
 * employees over 45 days is ~216,000 documents — tens of megabytes, and
 * unusable on a map. Endpoints for the same span are ~1,800 markers, which
 * clusters fine. The client cannot opt out of this.
 *
 * Photos ride along on endpoints only when the viewer holds
 * `attendance.view_photos`, matching what the Attendance module itself would
 * release for the same record.
 */
export async function getLocationHistory({ employeeId, employeeIds, date, from, to }, requestingUser) {
  // `date` (single day) is the original parameter and still works — the
  // Attendance location modal passes it.
  const singleDay = date ? { from: startOfDay(date), to: endOfDay(date) } : null;
  const { start, end, capped } = resolveRange(singleDay || { from, to });

  const requested = normaliseRequestedEmployees({ employeeId, employeeIds });
  const scopedIds = await resolveRequestedScope(requested, requestingUser);
  const isSingleEmployee = scopedIds.length === 1;

  const [endpoints, pings] = await Promise.all([
    findEndpoints(scopedIds, start, end, requestingUser),
    isSingleEmployee ? findPings(scopedIds, start, end) : Promise.resolve([]),
  ]);

  return {
    from: start.toISOString(),
    to: end.toISOString(),
    maxDays: HISTORY_MAX_DAYS,
    cappedToMaxDays: capped,
    // Stated rather than implied: a caller asking for everyone gets no trails,
    // and needs to know that is a rule and not an empty result.
    trailsIncluded: isSingleEmployee,
    employeeIds: scopedIds.map(String),
    endpoints,
    pings,
  };
}

function startOfDay(value) {
  const d = new Date(value);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function endOfDay(value) {
  const d = startOfDay(value);
  d.setDate(d.getDate() + 1);
  return d;
}

/** `employeeIds=a,b` | `employeeIds=all` | legacy `employeeId=a` | nothing. */
function normaliseRequestedEmployees({ employeeId, employeeIds }) {
  if (employeeIds === "all") {
    return "all";
  }

  if (typeof employeeIds === "string" && employeeIds.trim()) {
    return employeeIds.split(",").map((one) => one.trim()).filter(Boolean);
  }

  if (Array.isArray(employeeIds) && employeeIds.length) {
    return employeeIds.map(String);
  }

  return employeeId ? [String(employeeId)] : null;
}

/**
 * Intersects what was ASKED for with what the requester may SEE, reusing
 * `resolveVisibleEmployeeIds` rather than introducing a second scoping path.
 *
 * A named employee outside scope still 404s, matching the precedent this
 * module already set — a user who cannot see someone's data also cannot learn
 * whether that person exists.
 */
async function resolveRequestedScope(requested, requestingUser) {
  const visible = await resolveVisibleEmployeeIds(requestingUser);

  if (requested === "all" || requested === null) {
    if (visible === null) {
      const everyone = await User.find({}).select("_id");
      return everyone.map((one) => String(one._id));
    }

    // No explicit ask: default to the requester alone, as before.
    return requested === "all" ? visible : [String(requestingUser._id)];
  }

  if (visible !== null) {
    const outOfScope = requested.find((one) => !visible.includes(String(one)));

    if (outOfScope) {
      throw new ApiError(404, "Employee not found");
    }
  }

  return requested.map(String);
}

async function findPings(employeeIds, start, end) {
  return LocationPing.find({
    employeeId: { $in: employeeIds },
    capturedAt: { $gte: start, $lt: end },
  })
    .sort({ capturedAt: 1 })
    .select("employeeId attendanceId coords capturedAt");
}

/**
 * Check-in/check-out positions inside the window, flattened to one entry per
 * plotted point so the client never has to know the Attendance shape.
 */
async function findEndpoints(employeeIds, start, end, requestingUser) {
  const canSeePhotos = can(requestingUser, "attendance", "view_photos");

  const records = await Attendance.find({
    employeeId: { $in: employeeIds },
    date: { $gte: start, $lt: end },
  }).select("employeeId date checkIn checkOut geofenceViolations");

  const points = [];

  records.forEach((record) => {
    [
      ["checkIn", record.checkIn],
      ["checkOut", record.checkOut],
    ].forEach(([kind, event]) => {
      if (!event?.coords || typeof event.coords.lat !== "number") {
        return;
      }

      const breach = (record.geofenceViolations || []).find((violation) => {
        if (!event.time) {
          return false;
        }

        const at = new Date(event.time).getTime();
        const startsAt = new Date(violation.start).getTime();
        const endsAt = violation.end ? new Date(violation.end).getTime() : Infinity;

        return at >= startsAt && at <= endsAt;
      });

      points.push({
        attendanceId: record._id,
        employeeId: record.employeeId,
        date: record.date,
        kind,
        time: event.time,
        coords: { lat: event.coords.lat, lng: event.coords.lng },
        // Same rule the Attendance module applies to its own responses — the
        // photo is released only to a viewer holding `attendance.view_photos`.
        photoUrl: canSeePhotos ? event.photoUrl || null : null,
        geofenceBreachMeters: breach ? Math.round(breach.maxDistanceMeters) : null,
      });
    });
  });

  return points;
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
 * The interval the client should use to schedule its own ping loop, so
 * changing the cadence never requires a client redeploy (§7.4b).
 */
export function getPingIntervalConfig() {
  return { pingIntervalMinutes: Number(env.locationPingIntervalMinutes) };
}
