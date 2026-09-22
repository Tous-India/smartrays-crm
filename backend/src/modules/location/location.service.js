import ApiError from "../../utils/ApiError.js";
import { can } from "../../helpers/permission.helper.js";
import { env } from "../../config/env.js";
import { applyGeofenceCheck, closeOpenGeofenceViolation } from "../attendance/attendance.service.js";
import { signedAttendancePhotoUrl } from "../../services/cloudinary.service.js";
import LocationPing, { LOCATION_PING_TTL_SECONDS } from "./location.model.js";
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

// A fix may be timestamped slightly ahead of the server's clock; beyond this
// it is a broken clock, not a fix.
const FUTURE_TOLERANCE_MS = 60 * 1000;
const DUPLICATE_KEY_CODE = 11000;

const REASONS = {
  FUTURE: "capturedAt is in the future",
  TOO_OLD: "capturedAt is older than the retention window",
  NO_SHIFT: "no shift at capturedAt",
  WRITE_FAILED: "could not be stored",
};

/**
 * Records a BATCH of pings the app captured while it could not reach us
 * (mobile-backend-plan.md §3.2–§3.4). Beside `submitPing`, not instead of it:
 * the single form above keeps its literal "open shift at upload time" rule.
 *
 * The §3.4 faithful reading, decided: each ping is accepted when its
 * `capturedAt` falls inside a shift of THIS user — `checkIn.time ≤ capturedAt
 * ≤ checkOut.time`, or an open shift — and is attached to that shift. A shift
 * that has since closed still takes the pings captured during it; that is
 * the whole point of batching. A ping that matches no shift is rejected by
 * index with a reason, never silently dropped and never the whole batch's
 * failure: "3 of 200 rejected" is normal for a phone that was offline across
 * a check-out, and a 4xx would make the app re-send everything.
 *
 * Idempotent through `clientPingId` (§3.3): `insertMany(…, { ordered: false })`
 * stores what is new and reports the E11000s as duplicates, so a batch
 * retried after a timeout inserts nothing and reports it all as delivered.
 *
 * Geofence: the accepted pings are evaluated in `capturedAt` order against
 * their own shift, with the capture time as the violation timestamp, so the
 * windows land where the employee actually was. A shift that is already
 * closed is left with no open window — it is closed at that shift's own
 * check-out, as check-out itself would have done. `lastHeartbeatAt` is NOT
 * bumped: it means "the device reached us", and it did not, then.
 */
export async function submitPingBatch(pings, requestingUser) {
  const employeeId = requestingUser._id;
  const now = Date.now();
  const oldestAccepted = now - LOCATION_PING_TTL_SECONDS * 1000;

  const results = pings.map((ping, index) => ({ index, clientPingId: ping.clientPingId, status: "accepted" }));
  const reject = (index, reason) => {
    results[index].status = "rejected";
    results[index].reason = reason;
  };

  // Bounds first: a ping outside the storable window matches no shift anyway.
  pings.forEach((ping, index) => {
    const capturedAt = new Date(ping.capturedAt).getTime();

    if (capturedAt > now + FUTURE_TOLERANCE_MS) {
      reject(index, REASONS.FUTURE);
    } else if (capturedAt < oldestAccepted) {
      reject(index, REASONS.TOO_OLD);
    }
  });

  const shifts = await findShiftsCovering(employeeId, pings, results);
  const documents = [];

  pings.forEach((ping, index) => {
    if (results[index].status !== "accepted") {
      return;
    }

    const capturedAt = new Date(ping.capturedAt);
    const shift = shifts.find((one) => coversInstant(one, capturedAt));

    if (!shift) {
      reject(index, REASONS.NO_SHIFT);
      return;
    }

    documents.push({
      index,
      shift,
      doc: {
        employeeId,
        attendanceId: shift._id,
        coords: ping.coords,
        capturedAt,
        clientPingId: ping.clientPingId,
      },
    });
  });

  const failed = await insertUnordered(documents.map((entry) => entry.doc));

  failed.forEach((code, position) => {
    const { index } = documents[position];

    if (code === DUPLICATE_KEY_CODE) {
      results[index].status = "duplicate";
    } else {
      reject(index, REASONS.WRITE_FAILED);
    }
  });

  await applyGeofenceToBatch(documents.filter((entry) => results[entry.index].status === "accepted"));

  return {
    accepted: results.filter((one) => one.status === "accepted").length,
    duplicates: results.filter((one) => one.status === "duplicate").length,
    rejected: results
      .filter((one) => one.status === "rejected")
      .map(({ index, clientPingId, reason }) => ({ index, clientPingId, reason })),
    results,
  };
}

/**
 * The user's shifts that could contain any still-candidate ping: checked in
 * no later than the newest capture, and either still open or checked out no
 * earlier than the oldest capture. One query for the whole batch.
 */
async function findShiftsCovering(employeeId, pings, results) {
  const candidates = pings
    .filter((ping, index) => results[index].status === "accepted")
    .map((ping) => new Date(ping.capturedAt).getTime());

  if (candidates.length === 0) {
    return [];
  }

  const earliest = new Date(Math.min(...candidates));
  const latest = new Date(Math.max(...candidates));

  return Attendance.find({
    employeeId,
    "checkIn.time": { $ne: null, $lte: latest },
    $or: [{ "checkOut.time": null }, { "checkOut.time": { $gte: earliest } }],
  }).sort({ "checkIn.time": 1 });
}

function coversInstant(shift, instant) {
  const start = new Date(shift.checkIn.time).getTime();
  const end = shift.checkOut?.time ? new Date(shift.checkOut.time).getTime() : Infinity;
  const at = instant.getTime();

  return at >= start && at <= end;
}

/**
 * Inserts what it can and reports what it could not, as a map of position →
 * MongoDB error code. `ordered: false` keeps going past a duplicate key, and
 * the thrown bulk-write error carries the position of each failure.
 */
async function insertUnordered(docs) {
  const failed = new Map();

  if (docs.length === 0) {
    return failed;
  }

  try {
    await LocationPing.insertMany(docs, { ordered: false });
  } catch (error) {
    if (!Array.isArray(error.writeErrors)) {
      throw error;
    }

    // The driver's WriteError keeps the code on `.err`; older shapes had it
    // on the entry itself. Read both.
    error.writeErrors.forEach((writeError) => {
      failed.set(writeError.index, writeError.err?.code ?? writeError.code);
    });
  }

  return failed;
}

async function applyGeofenceToBatch(entries) {
  const ordered = [...entries].sort((a, b) => a.doc.capturedAt - b.doc.capturedAt);
  const touched = new Map();

  for (const entry of ordered) {
    // Sequential on purpose: each check reads the window the previous one left.
    // eslint-disable-next-line no-await-in-loop
    await applyGeofenceCheck(entry.shift, entry.doc.coords, entry.doc.capturedAt);
    touched.set(String(entry.shift._id), entry.shift);
  }

  for (const shift of touched.values()) {
    if (shift.checkOut?.time) {
      closeOpenGeofenceViolation(shift, shift.checkOut.time);
      // eslint-disable-next-line no-await-in-loop
      await shift.save();
    }
  }
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

  // Sub-paths are listed individually rather than projecting `checkIn`/
  // `checkOut` wholesale: MongoDB refuses a projection that names both a field
  // and one of its own subfields ("Path collision at checkIn.photoPublicId"),
  // and `photoPublicId` has to be named explicitly because it is `select:
  // false` on the schema. `photoUrl` is deliberately NOT loaded — since §7.69
  // the URL served is signed from the publicId, so the stored one is not
  // something this path should be able to hand out by accident.
  const records = await Attendance.find({
    employeeId: { $in: employeeIds },
    date: { $gte: start, $lt: end },
  }).select(
    "employeeId date geofenceViolations checkIn.time checkIn.coords +checkIn.photoPublicId checkOut.time checkOut.coords +checkOut.photoPublicId"
  );

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
        coords: {
          lat: event.coords.lat,
          lng: event.coords.lng,
          // Optional (§3.6) — rides inside coords only when it was stored.
          ...(typeof event.coords.accuracy === "number" ? { accuracy: event.coords.accuracy } : {}),
        },
        // Same rule the Attendance module applies to its own responses — the
        // photo is released only to a viewer holding `attendance.view_photos`.
        // Signed at read time from the publicId (§7.69): the stored URL is the
        // unsigned authenticated address and returns 401 by itself.
        photoUrl: canSeePhotos ? signedAttendancePhotoUrl(event.photoPublicId) : null,
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
export async function resolveVisibleEmployeeIds(requestingUser) {
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
  return {
    pingIntervalMinutes: Number(env.locationPingIntervalMinutes),
    // How long without a ping before a live position counts as STALE — the
    // same threshold the connectivity-gap rule uses (§6.5,
    // ATTENDANCE_GAP_THRESHOLD_MINUTES), so a client showing "stale" and the
    // server recording a gap agree on the moment silence begins. Read by the
    // app's team map (app-plan.md §2); the web still carries its own copy.
    staleAfterMinutes: Number(env.attendanceGapThresholdMinutes),
  };
}
