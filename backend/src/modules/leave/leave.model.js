import mongoose from "mongoose";

const LEAVE_TYPES = ["paid", "unpaid", "unapproved_absence"];
// Not in §6.5's terse field list, but required to support the request→approve
// workflow §7.5's endpoints imply (a leave has to start somewhere before an
// admin can "approve" it) — see leave.service.js for the full state machine.
const LEAVE_STATUSES = ["pending", "approved", "rejected"];

const leaveSchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // §6.5 says "date(s)" — interpreted here as an inclusive date range
    // (startDate/endDate), the simplest reasonable reading that still covers
    // a multi-day leave request; a single-day request just has
    // startDate === endDate.
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    type: {
      type: String,
      enum: LEAVE_TYPES,
      default: "paid",
    },
    status: {
      type: String,
      enum: LEAVE_STATUSES,
      default: "pending",
    },
    // Required as of 2026-07-31 (§7.5c) — the requester's own reason for
    // taking leave. Deliberately a separate field from `declineReason`
    // below (the APPROVER's reason for declining) — conflating the two
    // would mean a decline overwrites the requester's original context,
    // which is exactly what `declineReason` being its own field already
    // exists to avoid.
    reason: {
      type: String,
      required: true,
      trim: true,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    // True only for the unapproved-absence-marked-by-admin case, per the 2x
    // rule (smartrays.md: an unapproved absence counts as 2 leave days).
    isDoubleDeduction: {
      type: Boolean,
      default: false,
    },
    // Half-day leave support (added later). When true, the request counts as
    // 0.5 days against the monthly paid-leave quota and Payroll's
    // paid/unpaid-deduction day counting, rather than the full inclusive-day
    // span — see leave.service.js#computeLeaveDays, the single function both
    // that quota check and payroll.service.js's calculation now go through.
    // Validation enforces startDate === endDate whenever this is true — a
    // half day only ever describes a single day.
    isHalfDay: {
      type: Boolean,
      default: false,
    },
    // Set only by PATCH /leave/:id/decline — kept separate from `reason`
    // (the requester's own reason for taking leave) so declining a request
    // never overwrites that original context.
    declineReason: {
      type: String,
      trim: true,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const Leave = mongoose.model("Leave", leaveSchema);

export default Leave;
export { LEAVE_TYPES, LEAVE_STATUSES };
