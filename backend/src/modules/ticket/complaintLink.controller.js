import asyncWrapper from "../../utils/asyncWrapper.js";
import ApiResponse from "../../utils/ApiResponse.js";
import { getComplaintLink, resetComplaintLink } from "./complaintLink.service.js";
import { getComplaintPage, raiseComplaint } from "./publicComplaint.service.js";

// Staff: GET /customers/:id/complaint-link, POST /customers/:id/complaint-link/reset
export const getLink = asyncWrapper(async (req, res) => {
  const link = await getComplaintLink(req.params.id, req.user);

  res.status(200).json(new ApiResponse(200, link, "Complaint link fetched successfully"));
});

export const resetLink = asyncWrapper(async (req, res) => {
  const link = await resetComplaintLink(req.params.id, req.user);

  res.status(200).json(new ApiResponse(200, link, "A new complaint link was created; the old one no longer works"));
});

// Public (no login): GET/POST /public/complaints/:token
export const publicPage = asyncWrapper(async (req, res) => {
  const page = await getComplaintPage(req.params.token);

  res.status(200).json(new ApiResponse(200, page, "OK"));
});

export const publicRaise = asyncWrapper(async (req, res) => {
  const result = await raiseComplaint(req.params.token, req.body, req.files || []);

  res.status(201).json(new ApiResponse(201, result, "Complaint received"));
});
