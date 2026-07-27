import asyncWrapper from "../../utils/asyncWrapper.js";
import ApiResponse from "../../utils/ApiResponse.js";
import {
  getLeadsPipeline,
  getLeadsConversion,
  getLeadsBySource,
  getLeadsByClientType,
  getCustomersGrowth,
  getCustomersStatusSplit,
  getCustomersContractValue,
  getPaymentsTrend,
  getAmcRenewalsUpcoming,
  getAttendanceTrend,
  getPayrollCostTrend,
} from "./analytics.service.js";

export const leadsPipeline = asyncWrapper(async (req, res) => {
  const result = await getLeadsPipeline(req.user);
  res.status(200).json(new ApiResponse(200, result, "Leads pipeline fetched successfully"));
});

export const leadsConversion = asyncWrapper(async (req, res) => {
  const { from, to } = req.query;
  const result = await getLeadsConversion({ from, to }, req.user);
  res.status(200).json(new ApiResponse(200, result, "Leads conversion trend fetched successfully"));
});

export const leadsBySource = asyncWrapper(async (req, res) => {
  const result = await getLeadsBySource(req.user);
  res.status(200).json(new ApiResponse(200, result, "Leads by source fetched successfully"));
});

export const leadsByClientType = asyncWrapper(async (req, res) => {
  const result = await getLeadsByClientType(req.user);
  res.status(200).json(new ApiResponse(200, result, "Leads by client type fetched successfully"));
});

export const customersGrowth = asyncWrapper(async (req, res) => {
  const { from, to } = req.query;
  const result = await getCustomersGrowth({ from, to }, req.user);
  res.status(200).json(new ApiResponse(200, result, "Customers growth trend fetched successfully"));
});

export const customersStatusSplit = asyncWrapper(async (req, res) => {
  const result = await getCustomersStatusSplit(req.user);
  res.status(200).json(new ApiResponse(200, result, "Customers status split fetched successfully"));
});

export const customersContractValue = asyncWrapper(async (req, res) => {
  const result = await getCustomersContractValue(req.user);
  res.status(200).json(new ApiResponse(200, result, "Customers contract value fetched successfully"));
});

export const paymentsTrend = asyncWrapper(async (req, res) => {
  const { from, to } = req.query;
  const result = await getPaymentsTrend({ from, to });
  res.status(200).json(new ApiResponse(200, result, "Payments trend fetched successfully"));
});

export const amcRenewalsUpcoming = asyncWrapper(async (req, res) => {
  const { days } = req.query;
  const result = await getAmcRenewalsUpcoming({ days }, req.user);
  res.status(200).json(new ApiResponse(200, result, "Upcoming AMC renewals fetched successfully"));
});

export const attendanceTrend = asyncWrapper(async (req, res) => {
  const { from, to } = req.query;
  const result = await getAttendanceTrend({ from, to }, req.user);
  res.status(200).json(new ApiResponse(200, result, "Attendance trend fetched successfully"));
});

export const payrollCostTrend = asyncWrapper(async (req, res) => {
  const { from, to } = req.query;
  const result = await getPayrollCostTrend({ from, to });
  res.status(200).json(new ApiResponse(200, result, "Payroll cost trend fetched successfully"));
});
