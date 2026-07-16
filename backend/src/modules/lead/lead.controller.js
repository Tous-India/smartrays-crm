import asyncWrapper from "../../utils/asyncWrapper.js";
import ApiResponse from "../../utils/ApiResponse.js";
import ApiError from "../../utils/ApiError.js";
import {
  createLead,
  listLeads,
  getLeadDetail,
  updateLead,
  deleteLead,
  changeLeadStatus,
  toggleHotFlag,
  logLeadCall,
  getLeadCallHistory,
  convertLeadToCustomer,
  listLeadSources,
  importLeadsFromFile,
  exportLeadsToExcel,
} from "./lead.service.js";

export const create = asyncWrapper(async (req, res) => {
  const lead = await createLead(req.body, req.user);

  res.status(201).json(new ApiResponse(201, lead, "Lead created successfully"));
});

export const list = asyncWrapper(async (req, res) => {
  const leads = await listLeads(req.query, req.user);

  res.status(200).json(new ApiResponse(200, leads, "Leads fetched successfully"));
});

export const getOne = asyncWrapper(async (req, res) => {
  const lead = await getLeadDetail(req.params.id, req.user);

  res.status(200).json(new ApiResponse(200, lead, "Lead fetched successfully"));
});

export const update = asyncWrapper(async (req, res) => {
  const lead = await updateLead(req.params.id, req.body, req.user);

  res.status(200).json(new ApiResponse(200, lead, "Lead updated successfully"));
});

export const remove = asyncWrapper(async (req, res) => {
  await deleteLead(req.params.id, req.user);

  res.status(200).json(new ApiResponse(200, null, "Lead deleted successfully"));
});

export const changeStatus = asyncWrapper(async (req, res) => {
  const lead = await changeLeadStatus(req.params.id, req.body, req.user);

  res.status(200).json(new ApiResponse(200, lead, "Lead status updated successfully"));
});

export const toggleHot = asyncWrapper(async (req, res) => {
  const lead = await toggleHotFlag(req.params.id, req.user);

  res.status(200).json(new ApiResponse(200, lead, "Lead hot flag toggled successfully"));
});

export const logCall = asyncWrapper(async (req, res) => {
  const call = await logLeadCall(req.params.id, req.body, req.user);

  res.status(201).json(new ApiResponse(201, call, "Call logged successfully"));
});

export const getCallHistory = asyncWrapper(async (req, res) => {
  const calls = await getLeadCallHistory(req.params.id, req.user);

  res.status(200).json(new ApiResponse(200, calls, "Call history fetched successfully"));
});

export const convert = asyncWrapper(async (req, res) => {
  const customer = await convertLeadToCustomer(req.params.id, req.body, req.user);

  res.status(201).json(new ApiResponse(201, customer, "Lead converted to customer successfully"));
});

export const importLeads = asyncWrapper(async (req, res) => {
  if (!req.file) {
    throw new ApiError(400, "A CSV or Excel file is required");
  }

  const result = await importLeadsFromFile(req.file.buffer, req.file.originalname, req.user);

  res.status(201).json(new ApiResponse(201, result, "Leads imported"));
});

export const exportLeads = asyncWrapper(async (req, res) => {
  const buffer = await exportLeadsToExcel(req.query, req.user);

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader("Content-Disposition", "attachment; filename=leads-export.xlsx");
  res.status(200).send(buffer);
});

export const getSources = asyncWrapper(async (req, res) => {
  const sources = await listLeadSources();

  res.status(200).json(new ApiResponse(200, sources, "Lead sources fetched successfully"));
});
