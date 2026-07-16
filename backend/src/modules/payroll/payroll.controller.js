import asyncWrapper from "../../utils/asyncWrapper.js";
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
