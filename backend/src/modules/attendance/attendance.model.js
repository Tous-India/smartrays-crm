import mongoose from "mongoose";

// Originally a minimal placeholder for the `location` module (§7.4b) to
// determine whether an employee currently has an open shift. Extended
// 2026-07-13 to the full §6.5 shape: connectivityGaps[]/workingHours are now
// real, and checkIn/checkOut.photoUrl are now actually populated (via
// Cloudinary, src/services/cloudinary.service.js) instead of sitting unused.
const ATTENDANCE_STATUSES = ["present", "absent", "half_day", "on_leave"];

// The subset `POST /attendance/mark-status` is allowed to set — gap-filling
// only, on days with no record at all.
//
// `present` was added 2026-08-09 for the today's-roster feature (§7.4g). It
// had been excluded on the grounds that "present" is the one claim this system
// requires real check-in evidence for. The real objection was narrower than
// that: nothing distinguished a mark made on someone's word from one captured
// from a device. `isManuallyAdjusted` + `adjustedBy` ARE that distinction, they
// are set on every record this endpoint creates, and they are permanent — so a
// manually-marked "present" can always be told apart from a photo-and-GPS
// check-in, including in a payroll dispute months later. That is what makes it
// safe to allow, and the roster exists precisely for people who cannot check in
// (no internet, dead phone, app not loading).
//
// `on_leave` stays excluded, and the original reasoning stands unchanged: it is
// owned by the Leave module's approval flow, which writes the record itself on
// approval (`leave.service.js`). Hand-setting it here would create a leave
// state with no leave record behind it.
const MARKABLE_STATUSES = ["absent", "half_day", "present"];

const attendanceSchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    date: {
      type: Date,
      required: true,
    },
    checkIn: {
      // No longer schema-required as of the admin manual-correction feature
      // — a manually-created record (e.g. marking a day `absent`/`on_leave`
      // after the fact) legitimately has no real check-in event at all, and
      // synthesizing a fake timestamp for it would actively undermine the
      // audit-trail distinction this same feature exists to preserve (see
      // `isManuallyAdjusted` below). Real self-service check-in
      // (`attendance.service.js#checkIn`) still always sets a real `now`
      // here regardless — this relaxation only matters for the admin path.
      time: { type: Date, default: null },
      coords: {
        lat: Number,
        lng: Number,
      },
      photoUrl: String,
      // Cloudinary's own asset identifier (2026-07-31, §7.4c) — needed by
      // `attendancePhotoCleanupCron.js` to actually delete the asset via
      // `cloudinary.uploader.destroy(publicId)`; `photoUrl` alone isn't
      // enough to identify/delete a Cloudinary asset. `select: false` so it
      // never leaks into any normal API response (GET /attendance/me,
      // /team, or a check-in/check-out response itself) the way `photoUrl`
      // deliberately does — nothing outside the cleanup cron has any
      // legitimate use for this value. The cron explicitly re-selects it
      // (`.select("+checkIn.photoPublicId +checkOut.photoPublicId")`).
      photoPublicId: { type: String, select: false },
    },
    checkOut: {
      time: { type: Date, default: null },
      coords: {
        lat: Number,
        lng: Number,
      },
      photoUrl: String,
      photoPublicId: { type: String, select: false },
    },
    // Break In/Out (2026-07-31, §7.4c) — a single break per shift, not an
    // array (confirmed decision): this models "the one break" a shift gets,
    // not an open-ended log of arbitrarily many breaks. No `photoUrl` on
    // either — confirmed no photo required for a break event, unlike check-
    // in/check-out. `coords` IS required (enforced in attendance.validation.js,
    // matching check-in's own geolocation requirement) so a break's location
    // is still verifiable even without a photo.
    breakIn: {
      time: { type: Date, default: null },
      coords: {
        lat: Number,
        lng: Number,
      },
    },
    breakOut: {
      time: { type: Date, default: null },
      coords: {
        lat: Number,
        lng: Number,
      },
    },
    status: {
      type: String,
      enum: ATTENDANCE_STATUSES,
      default: "present",
    },
    // §6.5 — periods during the shift with no heartbeat received for longer
    // than ATTENDANCE_GAP_THRESHOLD_MINUTES; rendered red on the personal
    // timeline. See attendance.service.js#applyConnectivityGapIfNeeded.
    connectivityGaps: {
      type: [
        {
          start: { type: Date, required: true },
          end: { type: Date, required: true },
        },
      ],
      default: [],
    },
    // Geofencing (added later) — periods during the shift where a location
    // ping landed more than GEOFENCE_RADIUS_METERS from checkIn.coords (this
    // shift's geofence center, reused as-is — no separate storage needed);
    // rendered red on the timeline, distinctly from connectivityGaps. Unlike
    // connectivityGaps (always recorded as a complete, already-closed
    // interval), an entry here can be genuinely OPEN (`end: null`) between
    // pings — the ping stream is live, not summarized after the fact — and is
    // only closed by a later in-radius ping or at checkout, whichever comes
    // first. See attendance.service.js#applyGeofenceCheck/
    // closeOpenGeofenceViolation.
    geofenceViolations: {
      type: [
        {
          start: { type: Date, required: true },
          end: { type: Date, default: null },
          maxDistanceMeters: { type: Number, required: true },
        },
      ],
      default: [],
    },
    // §6.5 — computed once at checkout: (checkOut.time - checkIn.time) minus
    // total connectivityGaps duration, in hours. Null until checkout.
    workingHours: {
      type: Number,
      default: null,
    },
    // NOT in §6.5's field list — added as the bookkeeping this shift's
    // connectivity-gap detection needs: the last time this employee proved
    // they were still "alive" (a heartbeat, or check-in itself). Never
    // exposed as a distinct concept in the API; purely internal to
    // applyConnectivityGapIfNeeded.
    lastHeartbeatAt: {
      type: Date,
      default: null,
    },
    // Admin manual-correction feature — set together, always both or
    // neither, by `attendance.service.js#adjustAttendance`/
    // `createManualAttendance` (the only two writers of either field).
    // Exists so a record touched by an admin override is always visibly
    // distinguishable from a real, photo-verified self-service check-in —
    // both in the API response (every record includes it) and in the UI
    // (a small badge on the day's cell/detail view) — the whole system's
    // credibility rests on "present" meaning "verified present," so a
    // silent, indistinguishable admin edit would undermine that.
    isManuallyAdjusted: {
      type: Boolean,
      default: false,
    },
    adjustedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    // Why this record was marked by hand (§7.4h, 2026-08-09). REQUIRED on every
    // manual-mark path and enforced server-side, not just in the UI.
    //
    // This is the only attendance path with no device evidence behind it — no
    // photo, no coordinates, no heartbeat — so the reason is the entire record
    // of what actually happened. Without it a manual mark says "someone
    // decided this" and nothing more, which is not enough to settle a payroll
    // dispute months later.
    adjustmentReason: {
      type: String,
      trim: true,
      default: "",
    },
    // Every claim ever made about this day, not just the latest. Changing Half
    // Day to Full Day is a NEW claim rather than a correction of the old one,
    // and both are worth keeping: the fact that someone first said half and
    // then said full IS the audit trail. `adjustmentReason` above mirrors the
    // most recent entry so display code needs no lookup.
    adjustmentHistory: {
      type: [
        {
          status: { type: String, required: true },
          reason: { type: String, required: true },
          at: { type: Date, required: true },
          by: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        },
      ],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

/**
 * Backstop: no record may be saved with a check-out at or before its check-in
 * (2026-08-08).
 *
 * `attendance.service.js` already rejects this on both admin paths, and those
 * checks are the ones that produce a good error message at the right moment.
 * This exists so a FUTURE write path cannot quietly reintroduce the bug
 * without going through either of them — which is exactly how it went
 * unnoticed the first time: nothing at any level compared the two values, and
 * `computeWorkingHours`'s `Math.max(0, ...)` clamp turned every inverted pair
 * into a silent `workingHours: 0`.
 *
 * A plain `Error` carrying `statusCode`, rather than an `ApiError`, because
 * models in this codebase import nothing — `errorHandler.middleware.js` reads
 * `error.statusCode` off any thrown value, so this still surfaces as a 400
 * rather than a 500.
 *
 * Only fires when BOTH times are present: an open shift (check-in, no
 * check-out) is the normal shape of every record between check-in and
 * check-out, and clearing `checkOut.time` is a supported admin correction.
 */
attendanceSchema.pre("save", function assertCheckOutAfterCheckIn(next) {
  const checkInTime = this.checkIn?.time;
  const checkOutTime = this.checkOut?.time;

  if (checkInTime && checkOutTime && checkOutTime.getTime() <= checkInTime.getTime()) {
    const error = new Error("check-out time must be after the check-in time.");
    error.statusCode = 400;

    return next(error);
  }

  return next();
});

const Attendance = mongoose.model("Attendance", attendanceSchema);

export default Attendance;
export { ATTENDANCE_STATUSES, MARKABLE_STATUSES };
