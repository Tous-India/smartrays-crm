import mongoose from "mongoose";

// Known notification types today (§6.7/§7.11-Platform, Phase 9). Enforced as
// an enum, the same convention as LEAD_STATUSES/CALL_OUTCOMES elsewhere in
// this codebase — adding a new notification type later is a one-line change
// here, not a schema migration.
const NOTIFICATION_TYPES = [
  "lead_created",
  "lead_assigned",
  "lead_follow_up_due",
  "ticket_assigned",
  "leave_requested",
  "leave_approved",
  "leave_declined",
  // Added 2026-08-06 (§7.43) — being marked an unapproved absence is a
  // DECISION on a request, and the most consequential of the three: it flips
  // the type and applies `isDoubleDeduction`. It had no notification at all,
  // so the employee learned about a double deduction only by noticing it.
  // Not folded into `leave_approved`, even though the handler sets
  // `status: "approved"` internally — telling someone their leave was
  // "approved" when it was recorded as an unapproved absence would be worse
  // than silence.
  "leave_unapproved_absence",
  // Added 2026-07-31 (§7.4c) — check-in/break-in/break-out/check-out, each
  // notifying the employee themselves, their manager, and every admin (see
  // attendance.service.js#notifyAttendanceEvent).
  "attendance_check_in",
  "attendance_break_in",
  "attendance_break_out",
  "attendance_check_out",
];

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      enum: NOTIFICATION_TYPES,
      required: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    // Per §6.7: "relatedEntity (module + id)" — a plain, un-ref'd ObjectId
    // rather than a Mongoose `ref`, since the target collection varies by
    // `module` (Lead today, Ticket today, potentially others later) and a
    // single static `ref` can't express that. Nullable — not every
    // notification type necessarily needs to point back to a record.
    relatedEntity: {
      module: { type: String, default: null },
      id: { type: mongoose.Schema.Types.ObjectId, default: null },
    },
  },
  {
    timestamps: true,
  }
);

const Notification = mongoose.model("Notification", notificationSchema);

export default Notification;
export { NOTIFICATION_TYPES };
