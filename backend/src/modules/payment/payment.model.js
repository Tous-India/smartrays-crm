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
  },
  {
    timestamps: true,
  }
);

const Payment = mongoose.model("Payment", paymentSchema);

export default Payment;
