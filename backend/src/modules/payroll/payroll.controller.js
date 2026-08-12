import asyncWrapper from "../../utils/asyncWrapper.js";
import ApiError from "../../utils/ApiError.js";
import { buildMonthlyReport } from "../../services/salaryCalculation.service.js";
import {
  addAdjustment,
  approvePeriod,
  getPeriodReview,
  markPeriodPaid,
  submitPeriodForReview,
} from "./payroll.service.js";
import ApiResponse from "../../utils/ApiResponse.js";
import { runPayroll, listPayroll, generatePayslipPdf } from "./payroll.service.js";

export const run = asyncWrapper(async (req, res) => {
  const { employeeId, month, year, regenerate } = req.query;
  const result = await runPayroll({ employeeId, month, year, regenerate: regenerate === "true" });

  res.status(200).json(new ApiResponse(200, result, "Payroll run completed"));
});

export const list = asyncWrapper(async (req, res) => {
  const { scope, month } = req.query;
  const records = await listPayroll({ scope, month }, req.user);

  res.status(200).json(new ApiResponse(200, records, "Payroll records fetched successfully"));
});

export const payslip = asyncWrapper(async (req, res) => {
  const buffer = await generatePayslipPdf(req.params.id, req.user);

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", "attachment; filename=payslip.pdf");
  res.status(200).send(buffer);
});

/**
 * §7.47 — one row per active employee for a given month. Reads through the
 * SHARED calculator (`salaryCalculation.service.js`) rather than computing
 * here, so this and a future working Payroll run can never disagree.
 */
export const monthlyReport = asyncWrapper(async (req, res) => {
  const now = new Date();
  const year = Number(req.query.year) || now.getFullYear();
  const month = Number(req.query.month) || now.getMonth() + 1;

  if (month < 1 || month > 12) {
    throw new ApiError(400, "month must be between 1 and 12");
  }

  const rows = await buildMonthlyReport({ year, month });

  res.status(200).json(new ApiResponse(200, { year, month, rows }, "Monthly report generated"));
});

/** Month/year from the query, validated once for every period endpoint. */
function resolvePeriod(req) {
  const month = Number(req.query.month);
  const year = Number(req.query.year);

  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year)) {
    throw new ApiError(400, "A valid month (1-12) and year are required");
  }

  return { month, year };
}

/**
 * The review screen's data (§7.54) — every employee for the period with
 * anomalies flagged, so an admin sees the numbers before they become pay.
 */
export const periodReview = asyncWrapper(async (req, res) => {
  const { month, year } = resolvePeriod(req);
  const review = await getPeriodReview({ month, year });

  res.status(200).json(new ApiResponse(200, review, "Payroll period review"));
});

export const submitForReview = asyncWrapper(async (req, res) => {
  const { month, year } = resolvePeriod(req);
  const records = await submitPeriodForReview(month, year, req.user);

  res.status(200).json(new ApiResponse(200, records, "Payroll period submitted for review"));
});

/** The freeze. Explicit action, attributed to whoever performed it. */
export const approve = asyncWrapper(async (req, res) => {
  const { month, year } = resolvePeriod(req);
  const records = await approvePeriod(month, year, req.user);

  res.status(200).json(new ApiResponse(200, records, "Payroll period approved"));
});

/** Recording only — no disbursement, no gateway. */
export const markPaid = asyncWrapper(async (req, res) => {
  const { month, year } = resolvePeriod(req);
  const records = await markPeriodPaid(month, year, req.user, req.body?.paidAt);

  res.status(200).json(new ApiResponse(200, records, "Payroll period marked paid"));
});

/** A correction to an approved period, payable on the NEXT run. */
export const createAdjustment = asyncWrapper(async (req, res) => {
  const { month, year } = resolvePeriod(req);
  const adjustment = await addAdjustment(
    { employeeId: req.body?.employeeId, month, year, amount: req.body?.amount, reason: req.body?.reason },
    req.user
  );

  res.status(201).json(new ApiResponse(201, adjustment, "Adjustment raised for the next run"));
});

/**
 * Vercel Cron entry point (§7.54). Generates a DRAFT and nothing else.
 *
 * A machine must not decide what people are paid, so this can only ever reach
 * the first state — approval stays an explicit human action. Auth is handled by
 * the route's own token guard, matching /attendance/cleanup exactly.
 */
export const cronRun = asyncWrapper(async (req, res) => {
  const now = new Date();
  const month = Number(req.query.month) || (now.getMonth() === 0 ? 12 : now.getMonth());
  const year = Number(req.query.year) || (now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear());

  const result = await runPayroll({ month, year, regenerate: true });

  res.status(200).json(
    new ApiResponse(
      200,
      {
        month,
        year,
        generated: result.generated.length,
        skipped: result.skipped,
        status: "draft",
      },
      "Payroll draft generated"
    )
  );
});
