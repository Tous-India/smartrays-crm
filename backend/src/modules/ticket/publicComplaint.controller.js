import asyncWrapper from "../../utils/asyncWrapper.js";
import ApiResponse from "../../utils/ApiResponse.js";
import { getPublicStatus, submitPublicForm } from "./publicComplaint.service.js";

// Public (no login): POST /public/complaints, GET /public/complaints/status/:token
export const publicSubmit = asyncWrapper(async (req, res) => {
  const result = await submitPublicForm(req.body, req.files || []);

  res.status(201).json(new ApiResponse(201, result, result.kind === "complaint" ? "Complaint received" : "Request received"));
});

export const publicStatus = asyncWrapper(async (req, res) => {
  const status = await getPublicStatus(req.params.token);

  res.status(200).json(new ApiResponse(200, status, "OK"));
});
