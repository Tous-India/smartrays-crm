import mongoose from "mongoose";

const PAYMENT_AUDIT_ACTIONS = ["edited", "deleted"];

/**
 * A separate collection, not an embedded array on Payment (§7.9 audit-trail
 * extension, 2026-07-30) — matches this codebase's established pattern for
 * an unbounded, independently-queryable history tied to a parent record
 * (e.g. `LeadCall` for `Lead`), rather than growing the parent document
 * without limit. `paymentId` (not a full snapshot) is enough to always
 * resolve back to the payment even after a "delete," since deletion here is
 * soft (`Payment.isDeleted`, see payment.model.js) — the document this
 * points at always still exists. `previousValues` captures the payment's
 * field values immediately before THIS action (edit or delete) was applied,
 * so the full history of changes is reconstructable by walking entries in
 * order, not just the single most recent state.
 */
const paymentAuditLogSchema = new mongoose.Schema(
  {
    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payment",
      required: true,
    },
    action: {
      type: String,
      enum: PAYMENT_AUDIT_ACTIONS,
      required: true,
    },
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
    },
    previousValues: {
      type: Object,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

const PaymentAuditLog = mongoose.model("PaymentAuditLog", paymentAuditLogSchema);

export default PaymentAuditLog;
export { PAYMENT_AUDIT_ACTIONS };
