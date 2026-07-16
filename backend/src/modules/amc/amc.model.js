import mongoose from "mongoose";

const AMC_STATUSES = ["active", "expired"];
const AMC_CREATED_FROM_FLOWS = ["new_customer", "existing_customer"];

// Standalone record per §6.6 as originally documented — no automation on
// renewal for v1 (§11.3-adjacent resolved decision for this task) and no
// cross-linking to Contract/Invoice. `status` is purely admin-settable via
// PATCH /amc/:id; nothing here flips it to "expired" automatically when
// `renewalDate` passes.
const amcSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },
    amount: {
      type: Number,
      min: 0,
      default: null,
    },
    startDate: {
      type: Date,
      required: true,
    },
    renewalDate: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: AMC_STATUSES,
      default: "active",
    },
    createdFromFlow: {
      type: String,
      enum: AMC_CREATED_FROM_FLOWS,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

const AMC = mongoose.model("AMC", amcSchema);

export default AMC;
export { AMC_STATUSES, AMC_CREATED_FROM_FLOWS };
