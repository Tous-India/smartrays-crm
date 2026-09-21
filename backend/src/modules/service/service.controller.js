import asyncWrapper from "../../utils/asyncWrapper.js";
import ApiResponse from "../../utils/ApiResponse.js";
import {
  listServices,
  listAssignees,
  getService,
  createService,
  updateService,
  changeServiceStatus,
  changeSubtaskDone,
  deleteService,
} from "./service.service.js";

export const list = asyncWrapper(async (req, res) => {
  const { status, assignedTo } = req.query;
  const services = await listServices({ status, assignedTo }, req.user);

  res.status(200).json(new ApiResponse(200, services, "Services fetched successfully"));
});

export const assignees = asyncWrapper(async (req, res) => {
  const users = await listAssignees(req.user);

  res.status(200).json(new ApiResponse(200, users, "Assignable users fetched successfully"));
});

export const getOne = asyncWrapper(async (req, res) => {
  const service = await getService(req.params.id, req.user);

  res.status(200).json(new ApiResponse(200, service, "Service fetched successfully"));
});

export const create = asyncWrapper(async (req, res) => {
  const service = await createService(req.body, req.user);

  res.status(201).json(new ApiResponse(201, service, "Service created successfully"));
});

export const update = asyncWrapper(async (req, res) => {
  const service = await updateService(req.params.id, req.body, req.user);

  res.status(200).json(new ApiResponse(200, service, "Service updated successfully"));
});

export const changeStatus = asyncWrapper(async (req, res) => {
  const service = await changeServiceStatus(req.params.id, req.body.status, req.user);

  res.status(200).json(new ApiResponse(200, service, "Service status updated successfully"));
});

export const toggleSubtask = asyncWrapper(async (req, res) => {
  const service = await changeSubtaskDone(req.params.id, req.params.subtaskId, req.body.isDone, req.user);

  res.status(200).json(new ApiResponse(200, service, "Subtask updated successfully"));
});

export const remove = asyncWrapper(async (req, res) => {
  await deleteService(req.params.id, req.user);

  res.status(200).json(new ApiResponse(200, null, "Service deleted successfully"));
});
