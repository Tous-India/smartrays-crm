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
    // Renewal chain (2026-08-05) — points at the term this record replaced,
    // null for an original. Each renewal creates a NEW record rather than
    // editing dates in place, so every past term keeps its own amount and
    // date range verbatim; walking `previousAmcId` back reconstructs the
    // full history. Deliberately a backward link (child -> parent), not a
    // forward one: a renewal always knows what it renewed, whereas a
    // forward `nextAmcId` would need a write to the OLD record on every
    // renewal — exactly the mutation this design exists to avoid.
    previousAmcId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AMC",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const AMC = mongoose.model("AMC", amcSchema);

export default AMC;
export { AMC_STATUSES, AMC_CREATED_FROM_FLOWS };
