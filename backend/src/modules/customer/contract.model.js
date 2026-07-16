import mongoose from "mongoose";

// yearly contracts have no automation defined yet (§7.2/leads-customer-functional-spec.md
// only describe monthly→recurring-project and onetime→onetime-project automations) — see
// customer.service.js#applyContractAutomation.
const CONTRACT_TYPES = ["monthly", "onetime", "yearly"];

const contractSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },
    type: {
      type: String,
      enum: CONTRACT_TYPES,
      required: true,
    },
    amount: {
      type: Number,
      min: 0,
      default: null,
    },
    label: {
      type: String,
      trim: true,
    },
    renewalDate: {
      type: Date,
      default: null,
    },
    termYears: {
      type: Number,
      min: 0,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const Contract = mongoose.model("Contract", contractSchema);

export default Contract;
export { CONTRACT_TYPES };
