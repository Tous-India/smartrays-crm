import mongoose from "mongoose";

// The last three come from the customer complaint link (2026-10-22): the
// problem types a customer picks. "other" is shared by both sets.
const COMPLAINT_CATEGORIES = ["sales_billing", "technical", "installation", "other"];
const TICKET_CATEGORIES = ["new_project", "existing_client_query", "other", "sales_billing", "technical", "installation"];
// Where the ticket came from. "complaint_link" = the customer's public link,
// raised with no login (publicComplaint.service.js).
const TICKET_SOURCES = ["internal", "portal", "complaint_link"];
const CALLBACK_TIMES = ["morning", "afternoon", "evening", "anytime"];
// Escalation steps (ticketEscalation.service.js): not acknowledged in time,
// or not resolved in time — first the assignee's manager, then the admins.
const ESCALATION_KINDS = ["acknowledge", "resolve"];
const ESCALATION_LEVELS = ["manager", "admin"];
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
  // Null only for an entry written by a customer through the complaint link,
  // who has no user account — `byCustomer` is true for exactly those.
  authorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },
  byCustomer: {
    type: Boolean,
    default: false,
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
    // --- Customer complaint link (2026-10-22) — all optional, absent on
    // tickets raised before it existed. ---
    // The number the customer is told ("Complaint no. 1004"). Never the _id:
    // nothing public ever carries an internal id.
    number: {
      type: Number,
      default: undefined,
    },
    source: {
      type: String,
      enum: TICKET_SOURCES,
      default: "internal",
    },
    callbackTime: {
      type: String,
      enum: [...CALLBACK_TIMES, null],
      default: null,
    },
    // Who raised it through the link and on which number to call back — both
    // optional (2026-10-23): a company has several contacts, and the person
    // complaining may not be the one on file.
    contactName: {
      type: String,
      trim: true,
      default: null,
    },
    contactPhone: {
      type: String,
      trim: true,
      default: null,
    },
    // Photos the customer attached. Private (Cloudinary "authenticated"),
    // shown to staff through short-lived signed links only.
    customerPhotos: {
      type: [
        {
          publicId: { type: String, required: true },
          uploadedAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
    // First time anyone moved it off "open"; when it reached resolved/closed.
    acknowledgedAt: {
      type: Date,
      default: null,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
    // Each (kind, level) is written at most once — the record that the
    // reminder was sent, and to whom.
    escalations: {
      type: [
        {
          kind: { type: String, enum: ESCALATION_KINDS, required: true },
          level: { type: String, enum: ESCALATION_LEVELS, required: true },
          notifiedUserIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
          at: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

ticketSchema.index({ number: 1 }, { unique: true, partialFilterExpression: { number: { $type: "number" } } });
ticketSchema.index({ customerId: 1, source: 1, createdAt: -1 });
ticketSchema.index({ status: 1, createdAt: 1 });

const Ticket = mongoose.model("Ticket", ticketSchema);

export default Ticket;
export {
  TICKET_CATEGORIES,
  TICKET_STATUSES,
  TICKET_HISTORY_TYPES,
  COMPLAINT_CATEGORIES,
  TICKET_SOURCES,
  CALLBACK_TIMES,
  ESCALATION_KINDS,
  ESCALATION_LEVELS,
};
