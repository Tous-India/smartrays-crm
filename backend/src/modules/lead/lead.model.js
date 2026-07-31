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

// --- Solar-specific fields --------------------------------------------

const CLIENT_TYPES = ["residential", "commercial", "industrial"];
const ROOF_TYPES = ["rcc", "tin_shed", "tile", "ground_mount", "other"];
const CONNECTION_TYPES = ["single_phase", "three_phase"];
const SITE_SURVEY_STATUSES = ["not_scheduled", "scheduled", "completed"];

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
    // --- Solar-specific fields (.context/final-plan.md solar intake) ------
    // NOT `required: true` at the schema level (removed 2026-07-31 — see
    // lead.service.js#createLeadFromWebsiteIntake's own comment for why):
    // that constraint would make it impossible to create a website-intake
    // lead with no recognizable client-type signal in the submitted form,
    // contradicting the confirmed design that this field is deliberately
    // left unset for those leads until a manager/admin qualifies it via the
    // normal Edit flow. `POST /leads` (manual creation) still requires it —
    // enforced at the HTTP-validation layer instead
    // (`lead.validation.js#validateCreateLeadInput`), the same "required
    // only for this one path" pattern `lostReason` (required only when
    // `status: "lost"`) already uses in this same model.
    clientType: {
      type: String,
      enum: CLIENT_TYPES,
    },
    siteAddress: {
      type: String,
      trim: true,
      default: null,
    },
    monthlyElectricityBill: {
      type: Number,
      min: 0,
      default: null,
    },
    estimatedUnitsConsumed: {
      type: Number,
      min: 0,
      default: null,
    },
    estimatedCapacityKw: {
      type: Number,
      min: 0,
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
    // Only meaningful for residential clients — see
    // lead.validation.js#validateCreateLeadInput for the enforcement.
    subsidyApplicable: {
      type: Boolean,
      default: false,
    },
    siteSurveyStatus: {
      type: String,
      enum: SITE_SURVEY_STATUSES,
      default: "not_scheduled",
    },
    // Only meaningful once siteSurveyStatus has moved off "not_scheduled" —
    // same enforcement location as subsidyApplicable above.
    siteSurveyDate: {
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
export {
  LEAD_STATUSES,
  BUSINESS_STAGES,
  CLIENT_TYPES,
  ROOF_TYPES,
  CONNECTION_TYPES,
  SITE_SURVEY_STATUSES,
};
