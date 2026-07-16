import mongoose from "mongoose";

// Own collection, not an embedded array on Customer — same reasoning as
// LeadCall living apart from Lead (lead/leadCall.model.js): an ever-growing
// history shouldn't bloat the parent document, and GET /customers/:id/activity
// needs to query/sort/paginate it independently.
const ACTIVITY_ACTIONS = [
  "created",
  "edited",
  "deactivated",
  "reactivated",
  "contract_added",
  "contract_removed",
  "credential_revealed",
];

const customerActivitySchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },
    action: {
      type: String,
      enum: ACTIVITY_ACTIONS,
      required: true,
    },
    description: {
      type: String,
      trim: true,
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

const CustomerActivity = mongoose.model("CustomerActivity", customerActivitySchema);

export default CustomerActivity;
export { ACTIVITY_ACTIONS };
