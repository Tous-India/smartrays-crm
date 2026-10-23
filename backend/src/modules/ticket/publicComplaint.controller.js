import asyncWrapper from "../../utils/asyncWrapper.js";
import ApiResponse from "../../utils/ApiResponse.js";
import { getComplaintLink, resetComplaintLink } from "./complaintLink.service.js";
import { checkPhone, getLinkPrefill, getPublicStatus, submitPublicForm } from "./publicComplaint.service.js";

// Staff: GET /customers/:id/complaint-link, POST /customers/:id/complaint-link/reset
export const getLink = asyncWrapper(async (req, res) => {
  const link = await getComplaintLink(req.params.id, req.user);

  res.status(200).json(new ApiResponse(200, link, "Complaint link fetched successfully"));
});

export const resetLink = asyncWrapper(async (req, res) => {
  const link = await resetComplaintLink(req.params.id, req.user);

  res.status(200).json(new ApiResponse(200, link, "A new complaint link was created; the old one no longer works"));
});

// Public (no login): POST /public/complaints, POST /public/complaints/check-phone,
// GET /public/complaints/link/:token, GET /public/complaints/status/:token
export const publicSubmit = asyncWrapper(async (req, res) => {
  const result = await submitPublicForm(req.body, req.files || []);

  res.status(201).json(new ApiResponse(201, result, result.kind === "complaint" ? "Complaint received" : "Request received"));
});

export const publicCheckPhone = asyncWrapper(async (req, res) => {
  const result = await checkPhone(req.body);

  res.status(200).json(new ApiResponse(200, result, "OK"));
});

export const publicLinkPrefill = asyncWrapper(async (req, res) => {
  const prefill = await getLinkPrefill(req.params.token);

  res.status(200).json(new ApiResponse(200, prefill, "OK"));
});

export const publicStatus = asyncWrapper(async (req, res) => {
  const status = await getPublicStatus(req.params.token);

  res.status(200).json(new ApiResponse(200, status, "OK"));
});
