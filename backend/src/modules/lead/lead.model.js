import mongoose from "mongoose";

const LEAD_STATUSES = [
  "new",
  "contacted",
  "qualified",
  "proposal_sent",
  "negotiation",
  "won",
  "lost",
];

// Separate axis from `status` — how established the business is, not where it
// sits in the sales pipeline. See .context/final-plan.md §6.2.
const BUSINESS_STAGES = ["new", "old", "stable"];

const leadSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: null,
    },
    phone: {
      type: String,
      trim: true,
    },
    companyName: {
      type: String,
      trim: true,
    },
    // References LeadSource.name (a simple editable config list), not an
    // ObjectId — see leadSource.model.js and .context/final-plan.md §6.2.
    source: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: LEAD_STATUSES,
      default: "new",
    },
    businessStage: {
      type: String,
      enum: BUSINESS_STAGES,
      default: "new",
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    budget: {
      type: Number,
      min: 0,
      default: null,
    },
    // A lead has only one active follow-up at a time.
    followUpDate: {
      type: Date,
      default: null,
    },
    followUpNote: {
      type: String,
      trim: true,
      default: null,
    },
    isHot: {
      type: Boolean,
      default: false,
    },
    notes: {
      type: String,
      trim: true,
    },
    lostReason: {
      type: String,
      trim: true,
      default: null,
    },
    // Set once "Convert to Customer" runs. The customer module doesn't exist
    // yet (Phase 2) so this stays null until then — see lead.service.js.
    convertedCustomerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      default: null,
    },
    // Added for the follow-up reminder cron (§6.7/§7.1's "push 24h/15min
    // before follow-up," Phase 9) — necessary idempotency bookkeeping, the
    // same treatment as Attendance's `lastHeartbeatAt`: not part of §6.2's
    // documented Lead fields, but the cron can't run correctly without
    // somewhere to record "already reminded for this follow-up" so it never
    // double-sends on its next tick. Reset to null whenever `followUpDate`
    // changes (lead.service.js#updateLead) so a rescheduled follow-up
    // "re-arms" both reminders instead of silently staying suppressed.
    followUpReminder24hSentAt: {
      type: Date,
      default: null,
    },
    followUpReminder15mSentAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const Lead = mongoose.model("Lead", leadSchema);

export default Lead;
export { LEAD_STATUSES, BUSINESS_STAGES };
