import asyncWrapper from "../../utils/asyncWrapper.js";
import ApiResponse from "../../utils/ApiResponse.js";
import {
  requestLeave,
  listLeaves,
  approveLeave,
  markUnapprovedAbsence,
  declineLeave,
  deleteLeave,
  getLeaveBalance,
  getPendingLeaveCount,
} from "./leave.service.js";

export const request = asyncWrapper(async (req, res) => {
  const leave = await requestLeave(req.body, req.user);

  res.status(201).json(new ApiResponse(201, leave, "Leave requested successfully"));
});

export const list = asyncWrapper(async (req, res) => {
  const leaves = await listLeaves(req.query.scope, req.user);

  res.status(200).json(new ApiResponse(200, leaves, "Leave requests fetched successfully"));
});

export const approve = asyncWrapper(async (req, res) => {
  const leave = await approveLeave(req.params.id, req.user);

  res.status(200).json(new ApiResponse(200, leave, "Leave request approved"));
});

export const decline = asyncWrapper(async (req, res) => {
  const leave = await declineLeave(req.params.id, req.body.reason, req.user);

  res.status(200).json(new ApiResponse(200, leave, "Leave request declined"));
});

export const markAbsence = asyncWrapper(async (req, res) => {
  const leave = await markUnapprovedAbsence(req.params.id, req.user);

  res.status(200).json(new ApiResponse(200, leave, "Marked as an unapproved absence"));
});

export const balance = asyncWrapper(async (req, res) => {
  const data = await getLeaveBalance(req.query.employeeId, req.user);

  res.status(200).json(new ApiResponse(200, data, "Leave balance fetched successfully"));
});

export const remove = asyncWrapper(async (req, res) => {
  await deleteLeave(req.params.id, req.user);

  res.status(200).json(new ApiResponse(200, null, "Leave request deleted successfully"));
});

export const pendingCount = asyncWrapper(async (req, res) => {
  const total = await getPendingLeaveCount();

  res.status(200).json(new ApiResponse(200, { count: total }, "Pending leave count fetched successfully"));
});
