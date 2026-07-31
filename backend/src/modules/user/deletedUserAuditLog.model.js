import mongoose from "mongoose";

/**
 * A separate collection, not an embedded array anywhere (§7.28 hard-delete
 * extension, 2026-07-30) — same "independently-queryable history tied to a
 * parent record" pattern as `PaymentAuditLog` (payment module), but distinct
 * from it: this points at a User document that WILL NO LONGER EXIST once the
 * delete completes, so — unlike `PaymentAuditLog.previousValues` (which only
 * needs the fields that changed, since the parent Payment survives a soft
 * delete) — `snapshot` here must be the user's FULL document, captured
 * immediately before deletion, since it's the only place that data survives
 * afterward. `deletedUserId` is kept (not just embedded inside `snapshot`)
 * so this log stays queryable by id the same way `PaymentAuditLog` is
 * queryable by `paymentId`, even though the id it points to no longer
 * resolves to a live User.
 */
const deletedUserAuditLogSchema = new mongoose.Schema(
  {
    deletedUserId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
    },
    snapshot: {
      type: Object,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

const DeletedUserAuditLog = mongoose.model("DeletedUserAuditLog", deletedUserAuditLogSchema);

export default DeletedUserAuditLog;
