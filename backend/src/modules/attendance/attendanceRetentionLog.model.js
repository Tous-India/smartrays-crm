import mongoose from "mongoose";

/**
 * One summary row per retention run (§6.5, 2026-08-05).
 *
 * Exists because a hard delete with no trace is unrecoverable and, worse,
 * uninvestigable — you cannot answer "where did that record go" after the
 * fact. This is the cheap insurance: enough to reconstruct WHAT a run did
 * and WHEN, without retaining anything about the people involved.
 *
 * Deliberately holds **no personal data** — no employee ids, no names, no
 * photo URLs, no per-record detail. Just counts and the date window covered.
 * A retention mechanism that quietly accumulated its own shadow copy of the
 * data it deleted would defeat its own purpose.
 */
const attendanceRetentionLogSchema = new mongoose.Schema(
  {
    // The cutoff this run used — records dated before it were eligible.
    cutoffDate: {
      type: Date,
      required: true,
    },
    retentionDays: {
      type: Number,
      required: true,
    },
    // Oldest/newest record dates actually deleted this run, so a run's
    // effect can be described as a range rather than just a count. Null
    // when nothing was deleted.
    deletedFrom: { type: Date, default: null },
    deletedTo: { type: Date, default: null },

    deletedCount: { type: Number, default: 0 },
    // Held back by the payroll guard — attendance whose month has no
    // Payroll document yet. Expected to be non-zero routinely; it is not an
    // error, it is the guard working.
    skippedNoPayrollCount: { type: Number, default: 0 },
    // Cloudinary deletion failed, so the DB record was intentionally LEFT
    // in place for the next run to retry.
    failedCount: { type: Number, default: 0 },
    // How many records the run examined, bounded by the batch size.
    examinedCount: { type: Number, default: 0 },
    batchLimit: { type: Number, required: true },
  },
  {
    timestamps: true,
  }
);

const AttendanceRetentionLog = mongoose.model("AttendanceRetentionLog", attendanceRetentionLogSchema);

export default AttendanceRetentionLog;
