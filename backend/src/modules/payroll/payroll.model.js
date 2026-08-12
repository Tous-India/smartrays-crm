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
    // REPORTED ONLY — never priced. A shift with no heartbeat computes to zero
    // working hours (a real 17.4-hour overnight shift did), and heartbeats stop
    // whenever a phone locks or a tab is backgrounded. Pay is derived from DAY
    // COUNTS; this is carried for display and must not affect any amount.
    // Days actually paid for (§7.58) — calendar days minus days lost to pay.
    // The 2x surcharge does NOT reduce it: that is a monetary penalty, not a
    // day not worked. Consequence, intended: paidDays x dailyRate does not
    // reconcile to netAmount when a surcharge exists, which is why the LOP cell
    // always shows its split.
    paidDays: {
      type: Number,
      default: 0,
    },
    // The deduction split, stored so a payslip or an export can explain the
    // figure without recomputing it.
    surchargeAmount: {
      type: Number,
      default: 0,
    },
    absenceAmount: {
      type: Number,
      default: 0,
    },
    workingHoursTotal: {
      type: Number,
      required: true,
    },
    // The agreed MONTHLY salary, not a figure built up from days attended
    // (§7.53, 2026-08-12). Payroll previously computed
    // `dailyRate × (presentDays + paidLeaveDays)`, which paid nothing to an
    // employee with no attendance records — missing data read as unpaid.
    grossAmount: {
      type: Number,
      required: true,
    },
    // What was actually withheld, and how much of it was the §7.5 surcharge.
    // Stored rather than re-derived so a payslip can mark the ×2 without
    // recomputing anything.
    // `default: 0` rather than `required` — the service always sets it, but
    // several unrelated suites (retention, analytics, report export) construct
    // Payroll fixtures directly to test other things, and making a new field
    // mandatory would have broken every one of those construction sites for no
    // integrity gain.
    deduction: {
      type: Number,
      default: 0,
    },
    doubleDeductionDays: {
      type: Number,
      default: 0,
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
    // WHO ran it (§7.58). Null on every record written before this field
    // existed, and deliberately NOT backfilled — inventing an actor for a run
    // nobody can vouch for is worse than admitting we do not know.
    //
    // A null actor renders as "—", never "Automatic (cron)". `node-cron` does
    // not execute on Vercel serverless, so no run has ever been
    // cron-generated; labelling null as automatic would assert something false
    // about existing records. An automatic label is only ever shown when an
    // explicit system actor has been stored.
    generatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    generatedAt: {
      type: Date,
      required: true,
    },
    // Defaults to the 1st of the month AFTER the payroll month — see
    // payroll.service.js#runPayroll. This is the SCHEDULED pay date, computed
    // at generation; `paidAt` below is when someone actually recorded payment.
    paidOn: {
      type: Date,
      required: true,
    },

    // --- The pay run state machine (§7.54, 2026-08-12) ---
    //
    // draft -> review -> approved -> paid, and every transition is validated in
    // payroll.service.js. A draft is regenerated freely from live data; the
    // moment a period is APPROVED its figures are frozen and no code path
    // recomputes them, because a payslip that changes after the fact is not a
    // payslip. Editing a July attendance record in September must not move
    // July's pay.
    status: {
      type: String,
      enum: ["draft", "review", "approved", "paid"],
      default: "draft",
      required: true,
    },
    // WHO approved, and WHEN. Approval is the point at which numbers become
    // somebody's pay, so it is attributable by construction rather than by an
    // audit log that could be missing.
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    paidBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    paidAt: {
      type: Date,
      default: null,
    },

    // Corrections to an EARLIER, already-approved period, carried onto this
    // one. History is never mutated — the same discipline as an AMC renewal
    // creating a new record rather than extending in place. Copied onto the
    // record at generation from the `PayrollAdjustment` collection, so a
    // regenerated draft picks up anything raised since.
    adjustments: {
      type: [
        {
          amount: { type: Number, required: true },
          reason: { type: String, required: true, trim: true },
          createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
          createdAt: { type: Date, default: Date.now },
          // The period being corrected, which is NOT this record's period.
          sourceMonth: { type: Number, min: 1, max: 12 },
          sourceYear: { type: Number },
        },
      ],
      default: [],
    },
    adjustmentTotal: {
      type: Number,
      default: 0,
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
