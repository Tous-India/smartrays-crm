import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
  {
    // Exactly one of customerId/manualClientName is set (enforced in
    // payment.validation.js) — a real Customer record, or a free-text name
    // for a client with no account in the system yet.
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      default: null,
    },
    manualClientName: {
      type: String,
      trim: true,
      default: null,
    },
    date: {
      type: Date,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    notes: {
      type: String,
      trim: true,
    },
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Who physically collected the payment (e.g. a field sales rep taking
    // cash) — distinct from `recordedBy` (whoever entered it into the CRM,
    // possibly an admin doing so later). Optional: not every payment has a
    // separate collector worth naming, e.g. a bank transfer an admin
    // reconciles directly.
    collectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    // Added for partial reconciliation (§7.9/§11.3, resolved) — only ever
    // set when customerId is also set (an invoice always belongs to a real
    // Customer, so a manual-only payment has nothing to reconcile against).
    // Applying a payment with this set reduces the linked Invoice's balance
    // — see payment.service.js#applyPaymentToInvoice.
    invoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Invoice",
      default: null,
    },
    // Soft delete (§7.9 audit-trail extension, 2026-07-30) — chosen over a
    // hard delete since these are financial records: the document itself is
    // never actually removed, only excluded from normal list/total queries
    // (payment.service.js#listPayments filters `isDeleted: { $ne: true }`,
    // not `isDeleted: false` — existing rows predate this field entirely, so
    // a strict `false` match would silently exclude every payment recorded
    // before this change). See paymentAuditLog.model.js for the accompanying
    // edit/delete history this pairs with.
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    deletionReason: {
      type: String,
      trim: true,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const Payment = mongoose.model("Payment", paymentSchema);

export default Payment;
