import mongoose from "mongoose";
import { CLIENT_TYPES, ROOF_TYPES, CONNECTION_TYPES } from "../lead/lead.model.js";

const BILLING_TYPES = ["registered", "non_gst", "overseas"];
const CUSTOMER_STATUSES = ["active", "inactive"];

// --- Solar-specific fields --------------------------------------------

const NET_METERING_STATUSES = ["not_applied", "applied", "approved", "installed"];
const SUBSIDY_CLAIM_STATUSES = ["not_applicable", "pending", "approved", "rejected", "disbursed"];

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
    // --- Solar-specific fields (.context/final-plan.md solar intake) ------
    // `clientType`/`siteAddress`/`roofType`/`connectionType`/
    // `estimatedCapacityKw` are carried over from the Lead at conversion time
    // (lead.service.js#convertLeadToCustomer) — deliberately NOT `required`
    // here even though `clientType` is required on Lead: a customer created
    // directly (not via conversion) has no Lead to carry these from, and
    // making any of them required would repeat the exact bug the Lead-side
    // backfill script had to fix (Mongoose enforces `required` on every
    // `.save()`, not just creation — see backfillLeadClientType.js).
    clientType: {
      type: String,
      enum: CLIENT_TYPES,
      default: null,
    },
    siteAddress: {
      type: String,
      trim: true,
      default: null,
    },
    roofType: {
      type: String,
      enum: ROOF_TYPES,
      default: null,
    },
    connectionType: {
      type: String,
      enum: CONNECTION_TYPES,
      default: null,
    },
    estimatedCapacityKw: {
      type: Number,
      min: 0,
      default: null,
    },
    // The remaining solar fields are filled in later via normal edit, not at
    // conversion time — there's no Lead-side equivalent to carry them from.
    installedCapacityKw: {
      type: Number,
      min: 0,
      default: null,
    },
    commissioningDate: {
      type: Date,
      default: null,
    },
    panelBrand: {
      type: String,
      trim: true,
      default: null,
    },
    panelModel: {
      type: String,
      trim: true,
      default: null,
    },
    inverterBrand: {
      type: String,
      trim: true,
      default: null,
    },
    inverterModel: {
      type: String,
      trim: true,
      default: null,
    },
    panelWarrantyExpiry: {
      type: Date,
      default: null,
    },
    inverterWarrantyExpiry: {
      type: Date,
      default: null,
    },
    workmanshipWarrantyExpiry: {
      type: Date,
      default: null,
    },
    netMeteringStatus: {
      type: String,
      enum: NET_METERING_STATUSES,
      default: "not_applied",
    },
    subsidyClaimStatus: {
      type: String,
      enum: SUBSIDY_CLAIM_STATUSES,
      default: "not_applicable",
    },
  },
  {
    timestamps: true,
  }
);

const Customer = mongoose.model("Customer", customerSchema);

export default Customer;
export { BILLING_TYPES, CUSTOMER_STATUSES, NET_METERING_STATUSES, SUBSIDY_CLAIM_STATUSES };
