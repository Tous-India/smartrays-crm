import mongoose from "mongoose";

const BILLING_TYPES = ["registered", "non_gst", "overseas"];
const CUSTOMER_STATUSES = ["active", "inactive"];

const customerSchema = new mongoose.Schema(
  {
    companyName: {
      type: String,
      required: true,
      trim: true,
    },
    billingType: {
      type: String,
      enum: BILLING_TYPES,
      default: null,
    },
    billingName: {
      type: String,
      trim: true,
    },
    billingAddress: {
      type: String,
      trim: true,
    },
    billingState: {
      type: String,
      trim: true,
    },
    gstin: {
      type: String,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: null,
    },
    website: {
      type: String,
      trim: true,
    },
    industry: {
      type: String,
      trim: true,
    },
    // Account manager — same scoping role as Lead.ownerId (§11.9): admin sees
    // all, a manager sees customers owned by their direct reports, everyone
    // else sees only their own.
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Required at creation (smartrays.md-specific) — the person who runs this
    // customer's delivery work, not necessarily their org-chart manager. No
    // role restriction is documented for this field (unlike User.managerId,
    // which must be a manager/admin) — any existing user can be a PM.
    projectManagerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    source: {
      type: String,
      trim: true,
    },
    customerStatus: {
      type: String,
      enum: CUSTOMER_STATUSES,
      default: "active",
    },
    signedUpAt: {
      type: Date,
      default: Date.now,
    },
    notes: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

const Customer = mongoose.model("Customer", customerSchema);

export default Customer;
export { BILLING_TYPES, CUSTOMER_STATUSES };
