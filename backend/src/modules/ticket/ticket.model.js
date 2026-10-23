import mongoose from "mongoose";

// The last three were the per-customer link's problem types (2026-10-22);
// still valid values, no longer offered — the public form (2026-10-23) has no
// category, its complaints are "other".
const TICKET_CATEGORIES = ["new_project", "existing_client_query", "other", "sales_billing", "technical", "installation"];
// Where the ticket came from. "complaint_link" = the public complaint form,
// raised with no login (publicComplaint.service.js). The name is kept from
// the per-customer link it replaced (2026-10-23); it is the same idea.
const TICKET_SOURCES = ["internal", "portal", "complaint_link"];
const CALLBACK_TIMES = ["morning", "afternoon", "evening", "anytime"];
// Complaint steps (2026-10-23): "open" is Received (nobody assigned yet);
// an assigner hands it out ("assigned"); the technician moves it through
// "on_the_way" and "working" to "resolved". The first four statuses are the
// internal-ticket lifecycle and stay valid for those tickets.
const COMPLAINT_STATUSES = ["open", "assigned", "on_the_way", "working", "resolved"];
const TICKET_STATUSES = ["open", "in_progress", "resolved", "closed", "assigned", "on_the_way", "working"];
const COMPLAINT_PRIORITIES = ["low", "medium", "high", "urgent"];
// Reminders (ticketEscalation.service.js): not assigned in time (to the
// assigners), visit date passed and not resolved (technician + assigners).
const REMINDER_KINDS = ["unassigned", "visit_overdue"];
// What `history[]` holds (§6.6: "timeline of status changes/comments"),
// plus the complaint actions (2026-10-23) so the timeline says who did what.
const TICKET_HISTORY_TYPES = ["status_change", "comment", "assigned", "sent_back", "photo"];

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
  // alongside a "status_change" entry (a note explaining the change); the
  // reason of a "sent_back" entry; the summary line of an "assigned" one.
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
    // Not required for a complaint from the public form (2026-10-23): it is
    // set only when the caller's phone number matched an existing customer.
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required() {
        return this.source !== "complaint_link";
      },
      default: null,
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
    // Where to go (2026-10-23): what the caller typed, and the phone's GPS
    // position when they pressed "Use my current location".
    address: {
      type: String,
      trim: true,
      default: null,
    },
    location: {
      type: {
        lat: { type: Number, min: -90, max: 90 },
        lng: { type: Number, min: -180, max: 180 },
        accuracy: { type: Number, min: 0 },
      },
      default: null,
      _id: false,
    },
    // SHA-256 of the customer's status-link token. The token itself is shown
    // once, after submitting, and never stored.
    statusTokenHash: {
      type: String,
      select: false,
      default: undefined,
    },
    // Set by whoever assigns it (complaints.assign).
    priority: {
      type: String,
      enum: [...COMPLAINT_PRIORITIES, null],
      default: null,
    },
    // The planned visit day, India date "YYYY-MM-DD".
    visitDate: {
      type: String,
      match: /^\d{4}-\d{2}-\d{2}$/,
      default: null,
    },
    assignedById: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    assignedAt: {
      type: Date,
      default: null,
    },
    // When it last became unassigned — raised, or sent back by the
    // technician. The "not assigned in time" reminder counts from here.
    unassignedSince: {
      type: Date,
      default: null,
    },
    // Live-camera photos the technician took at the site.
    staffPhotos: {
      type: [
        {
          publicId: { type: String, required: true },
          uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
          uploadedAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
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
    // When it reached resolved/closed.
    resolvedAt: {
      type: Date,
      default: null,
    },
    // Each (kind, key) is written at most once — the record that the
    // reminder was sent, and to whom. `key` is the visit date for
    // "visit_overdue" (a new date can be reminded again), "" otherwise.
    reminders: {
      type: [
        {
          kind: { type: String, enum: REMINDER_KINDS, required: true },
          key: { type: String, default: "" },
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
ticketSchema.index({ statusTokenHash: 1 }, { unique: true, partialFilterExpression: { statusTokenHash: { $type: "string" } } });
ticketSchema.index({ source: 1, assignedToId: 1, status: 1 });

const Ticket = mongoose.model("Ticket", ticketSchema);

export default Ticket;
export {
  TICKET_CATEGORIES,
  TICKET_STATUSES,
  TICKET_HISTORY_TYPES,
  COMPLAINT_STATUSES,
  COMPLAINT_PRIORITIES,
  TICKET_SOURCES,
  CALLBACK_TIMES,
  REMINDER_KINDS,
};
