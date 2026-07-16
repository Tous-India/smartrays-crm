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
    reason: {
      type: String,
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
  },
  {
    timestamps: true,
  }
);

const Leave = mongoose.model("Leave", leaveSchema);

export default Leave;
export { LEAVE_TYPES, LEAVE_STATUSES };
