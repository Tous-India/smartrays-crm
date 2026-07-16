import mongoose from "mongoose";

// Minimal placeholder — same treatment as the Attendance model was given for
// Location Tracking (§7.4b): just enough schema for the contract automation
// chain (customer.service.js) to have somewhere real to write a draft invoice
// record. Full invoicing (recurring profile generation, real invoice
// numbering, ledger, payment tracking) is Phase 7 (.context/final-plan.md
// §6.3/§7.9) and not built here — no invoice.service/controller/routes exist
// yet, and GET /customers/:id/invoices + /ledger are deliberately NOT built
// in this task.
const INVOICE_TYPES = ["proforma", "gst"];
// "partially_paid" added for Payments' partial reconciliation (§7.9/§11.3,
// resolved) — a Payment can be explicitly linked to an Invoice, reducing its
// balance; if that doesn't zero the balance out, the original 4-value enum
// had no status to represent "some money has come in, but not fully paid".
const INVOICE_STATUSES = ["draft", "sent", "partially_paid", "paid", "cancelled"];

const invoiceSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },
    contractId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contract",
      default: null,
    },
    number: {
      type: String,
      default: null,
    },
    type: {
      type: String,
      enum: INVOICE_TYPES,
      default: "proforma",
    },
    amount: {
      type: Number,
      min: 0,
      default: null,
    },
    balance: {
      type: Number,
      min: 0,
      default: null,
    },
    status: {
      type: String,
      enum: INVOICE_STATUSES,
      default: "draft",
    },
    issuedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const Invoice = mongoose.model("Invoice", invoiceSchema);

export default Invoice;
export { INVOICE_TYPES, INVOICE_STATUSES };
