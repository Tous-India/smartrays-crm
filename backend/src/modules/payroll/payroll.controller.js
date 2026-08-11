import asyncWrapper from "../../utils/asyncWrapper.js";
import ApiError from "../../utils/ApiError.js";
import { buildMonthlyReport } from "../../services/salaryCalculation.service.js";
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
