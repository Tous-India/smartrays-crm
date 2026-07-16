import mongoose from "mongoose";

const CALL_OUTCOMES = ["connected", "no_answer", "voicemail", "callback"];

const leadCallSchema = new mongoose.Schema(
  {
    leadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lead",
      required: true,
    },
    calledAt: {
      type: Date,
      required: true,
    },
    durationSeconds: {
      type: Number,
      min: 0,
      default: 0,
    },
    outcome: {
      type: String,
      enum: CALL_OUTCOMES,
      required: true,
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

const LeadCall = mongoose.model("LeadCall", leadCallSchema);

export default LeadCall;
export { CALL_OUTCOMES };
