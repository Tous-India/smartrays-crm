import mongoose from "mongoose";

/**
 * "This open shift has been reminded about" (§7.74) — its own collection,
 * deliberately NOT a field on Attendance: the reminder is bookkeeping about
 * a push, and Attendance feeds payroll, so nothing about a forgotten
 * check-out is allowed to write to it. One row per shift (the unique index
 * is what makes "send once" hold even when two heartbeats race), pointing
 * at the record it was about.
 */
const shiftReminderSchema = new mongoose.Schema(
  {
    attendanceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Attendance",
      required: true,
      unique: true,
    },
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // How long the shift had been open when the reminder went out, in hours.
    openForHours: {
      type: Number,
      required: true,
    },
    sentAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

const ShiftReminder = mongoose.model("ShiftReminder", shiftReminderSchema);

export default ShiftReminder;
