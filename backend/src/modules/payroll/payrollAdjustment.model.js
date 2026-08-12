import mongoose from "mongoose";

/**
 * A correction to an already-approved pay period (§7.54, 2026-08-12).
 *
 * An approved run is IMMUTABLE. When something was wrong, the fix is a labelled
 * line on the NEXT run rather than an edit to history — the same discipline AMC
 * renewal follows by creating a new record instead of extending one in place.
 * The alternative is a payslip that silently disagrees with the one already
 * handed to someone, which is exactly the dispute this module exists to avoid.
 *
 * Lives in its OWN collection rather than inside the Payroll record it corrects,
 * for two reasons: it is raised before the target period's draft exists, and a
 * draft is regenerated freely — an adjustment embedded in a draft would be
 * destroyed by the next re-run. Generation copies unapplied adjustments onto the
 * draft; `appliedToPayrollId` records where they landed.
 */
const payrollAdjustmentSchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // The period this adjustment will be PAID IN — the run after the mistake.
    month: { type: Number, required: true, min: 1, max: 12 },
    year: { type: Number, required: true },
    // The period being corrected. Kept so a payslip can say what the line is
    // for; a bare amount with no origin is not a correction, it is a mystery.
    sourceMonth: { type: Number, min: 1, max: 12 },
    sourceYear: { type: Number },
    // Signed: negative claws back an overpayment, positive pays a shortfall.
    amount: { type: Number, required: true },
    reason: {
      type: String,
      required: true,
      trim: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Null until a draft for its period picks it up. Not deleted once applied —
    // the trail of what was corrected, when and by whom is the point.
    appliedToPayrollId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payroll",
      default: null,
    },
  },
  { timestamps: true }
);

payrollAdjustmentSchema.index({ employeeId: 1, month: 1, year: 1 });

const PayrollAdjustment = mongoose.model("PayrollAdjustment", payrollAdjustmentSchema);

export default PayrollAdjustment;
