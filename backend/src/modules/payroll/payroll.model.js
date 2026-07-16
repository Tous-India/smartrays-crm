import mongoose from "mongoose";

const payrollSchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    month: {
      type: Number,
      required: true,
      min: 1,
      max: 12,
    },
    year: {
      type: Number,
      required: true,
    },
    daysInMonth: {
      type: Number,
      required: true,
    },
    presentDays: {
      type: Number,
      required: true,
    },
    paidLeaveDays: {
      type: Number,
      required: true,
    },
    unpaidDeductionDays: {
      type: Number,
      required: true,
    },
    workingHoursTotal: {
      type: Number,
      required: true,
    },
    grossAmount: {
      type: Number,
      required: true,
    },
    netAmount: {
      type: Number,
      required: true,
    },
    // NOT in §6.5's field list — added the same way Attendance's
    // `lastHeartbeatAt` was: §11.4 (resolved 2026-07-13) makes approved
    // TravelLog distance feed payroll, and there's nowhere else on this model
    // to record the resulting reimbursement amount. Already added into
    // `netAmount`; kept as its own field too so a payslip can show it as a
    // separate line item rather than an opaque part of the total.
    mileageReimbursement: {
      type: Number,
      default: 0,
    },
    generatedAt: {
      type: Date,
      required: true,
    },
    // Defaults to the 1st of the month AFTER the payroll month — see
    // payroll.service.js#runPayroll.
    paidOn: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// One Payroll record per employee per month/year — runPayroll checks this
// before creating a new one (reject unless explicitly regenerating).
payrollSchema.index({ employeeId: 1, month: 1, year: 1 }, { unique: true });

const Payroll = mongoose.model("Payroll", payrollSchema);

export default Payroll;
