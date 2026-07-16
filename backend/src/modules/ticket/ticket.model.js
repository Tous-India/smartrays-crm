import mongoose from "mongoose";

const TICKET_CATEGORIES = ["new_project", "existing_client_query", "other"];
const TICKET_STATUSES = ["open", "in_progress", "resolved", "closed"];
// Not a lifecycle enum — just the two kinds of entry `history[]` holds
// (§6.6: "timeline of status changes/comments").
const TICKET_HISTORY_TYPES = ["status_change", "comment"];

const ticketHistoryEntrySchema = new mongoose.Schema({
  type: {
    type: String,
    enum: TICKET_HISTORY_TYPES,
    required: true,
  },
  authorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  // Present for every "comment" entry (the actual text) and optionally
  // alongside a "status_change" entry (a note explaining the change).
  comment: {
    type: String,
    trim: true,
    default: null,
  },
  // Only set for "status_change" entries.
  fromStatus: {
    type: String,
    enum: TICKET_STATUSES,
    default: null,
  },
  toStatus: {
    type: String,
    enum: TICKET_STATUSES,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const ticketAttachmentSchema = new mongoose.Schema({
  url: {
    type: String,
    required: true,
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  uploadedAt: {
    type: Date,
    default: Date.now,
  },
});

const ticketSchema = new mongoose.Schema(
  {
    // NOT in §6.6's terse field list — a short summary is necessary for any
    // ticket list view; the same treatment as other fields §6.x's terse
    // model lists omitted but the build needed (baseSalary, lastHeartbeatAt,
    // etc.) — see final-plan.md §6.6 for this addition documented as a
    // resolved gap, not a silent one.
    subject: {
      type: String,
      required: true,
      trim: true,
    },
    // The specific customer-portal User account that raised this ticket
    // (ref User, not Customer — a company can have several portal accounts,
    // and this identifies WHICH one). Null for internally-raised tickets
    // (admin/manager raising on the client's behalf, e.g. after a support
    // call) — §6.6: "nullable if internal".
    raisedByCustomerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    // Which company this ticket concerns — always set, even for an
    // internally-raised ticket (smartrays.md frames every ticket as
    // originating from "client call to the support"; there's no concept of
    // a ticket unrelated to any customer in this build).
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },
    category: {
      type: String,
      enum: TICKET_CATEGORIES,
      default: "other",
    },
    status: {
      type: String,
      enum: TICKET_STATUSES,
      default: "open",
    },
    assignedToId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    attachments: {
      type: [ticketAttachmentSchema],
      default: [],
    },
    history: {
      type: [ticketHistoryEntrySchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

const Ticket = mongoose.model("Ticket", ticketSchema);

export default Ticket;
export { TICKET_CATEGORIES, TICKET_STATUSES, TICKET_HISTORY_TYPES };
