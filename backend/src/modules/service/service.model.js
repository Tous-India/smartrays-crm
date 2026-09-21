import mongoose from "mongoose";

/**
 * Services (§7.72, 2026-09-19) — internal work items an admin or manager
 * assigns to ONE employee. Purely internal: no customer, no project, no AMC,
 * no ticket. Two states and nothing in between.
 *
 * This supersedes the Task sub-feature removed on 2026-07-29 (§6.4/§7.3) and
 * deliberately drops what that model assumed: a required `projectId` that
 * drove both assignment and visibility, an `in_progress` state with a
 * start/stop timer, and a one-in-progress-per-employee constraint. A service
 * is visible by WHO IT IS ASSIGNED TO, resolved through the same manager →
 * direct-reports scope every other module uses (service.service.js).
 */
const SERVICE_STATUSES = ["todo", "completed"];

const subtaskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    isDone: { type: Boolean, default: false },
  },
  { _id: true }
);

const serviceSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    status: {
      type: String,
      enum: SERVICE_STATUSES,
      default: "todo",
    },
    // Exactly one assignee — the whole point of the record, and the field
    // every visibility query is keyed on.
    assignedToId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    createdById: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    dueDate: {
      type: Date,
      default: null,
    },
    subtasks: {
      type: [subtaskSchema],
      default: [],
    },
    // Set together when the status flips to `completed`; cleared together
    // when it flips back. Never edited directly (service.service.js#changeStatus).
    completedAt: {
      type: Date,
      default: null,
    },
    completedById: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// The list query is always "these assignees, optionally this status".
serviceSchema.index({ assignedToId: 1, status: 1 });

const Service = mongoose.model("Service", serviceSchema);

export default Service;
export { SERVICE_STATUSES };
