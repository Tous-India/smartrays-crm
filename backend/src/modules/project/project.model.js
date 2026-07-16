import mongoose from "mongoose";

const PROJECT_TYPES = ["recurring", "onetime"];
const PROJECT_STATUSES = ["active", "completed", "paused"];

const projectSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },
    projectManagerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    teamMemberIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    type: {
      type: String,
      enum: PROJECT_TYPES,
      required: true,
    },
    status: {
      type: String,
      enum: PROJECT_STATUSES,
      default: "active",
    },
    // Set when this project was auto-created by a Contract (customer.service.js
    // §7.2's contract automation) — null for any project created another way
    // in the future.
    linkedContractId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contract",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const Project = mongoose.model("Project", projectSchema);

export default Project;
export { PROJECT_TYPES, PROJECT_STATUSES };
