import mongoose from "mongoose";

export const CONSENT_DECISIONS = ["granted", "declined"];

/**
 * One employee decision on the location-tracking disclosure (final-plan.md
 * §7.73). APPEND-ONLY: a new decision is a new document; nothing here is ever
 * updated or deleted by the application, so the history of what was agreed,
 * when, on which wording and from which install is always recoverable. The
 * latest document per user is "the" current decision.
 *
 * `disclosureVersion` is the app's version string for the disclosure text;
 * when the text changes the app asks again, and the answer to the new text
 * is a new record.
 */
const locationConsentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    decision: {
      type: String,
      enum: CONSENT_DECISIONS,
      required: true,
    },
    disclosureVersion: {
      type: String,
      required: true,
    },
    appVersion: {
      type: String,
      default: null,
    },
    deviceId: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// "The latest decision for this user" is the one query this collection serves.
locationConsentSchema.index({ userId: 1, createdAt: -1 });

const LocationConsent = mongoose.model("LocationConsent", locationConsentSchema);

export default LocationConsent;
