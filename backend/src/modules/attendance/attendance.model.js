import mongoose from "mongoose";

// Originally a minimal placeholder for the `location` module (§7.4b) to
// determine whether an employee currently has an open shift. Extended
// 2026-07-13 to the full §6.5 shape: connectivityGaps[]/workingHours are now
// real, and checkIn/checkOut.photoUrl are now actually populated (via
// Cloudinary, src/services/cloudinary.service.js) instead of sitting unused.
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
      time: { type: Date, required: true },
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
      enum: ["present", "absent", "half_day", "on_leave"],
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
  },
  {
    timestamps: true,
  }
);

const Attendance = mongoose.model("Attendance", attendanceSchema);

export default Attendance;
