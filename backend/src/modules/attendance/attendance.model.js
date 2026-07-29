import mongoose from "mongoose";

// Originally a minimal placeholder for the `location` module (§7.4b) to
// determine whether an employee currently has an open shift. Extended
// 2026-07-13 to the full §6.5 shape: connectivityGaps[]/workingHours are now
// real, and checkIn/checkOut.photoUrl are now actually populated (via
// Cloudinary, src/services/cloudinary.service.js) instead of sitting unused.
const ATTENDANCE_STATUSES = ["present", "absent", "half_day", "on_leave"];

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
    },
    checkOut: {
      time: { type: Date, default: null },
      coords: {
        lat: Number,
        lng: Number,
      },
      photoUrl: String,
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
  },
  {
    timestamps: true,
  }
);

const Attendance = mongoose.model("Attendance", attendanceSchema);

export default Attendance;
export { ATTENDANCE_STATUSES };
