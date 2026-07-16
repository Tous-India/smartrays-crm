import asyncWrapper from "../../utils/asyncWrapper.js";
import ApiResponse from "../../utils/ApiResponse.js";
import {
  listProjects,
  getProjectById,
  updateProjectTeam,
  listProjectTasks,
  createTask,
  startTask,
  stopTask,
} from "./project.service.js";

export const list = asyncWrapper(async (req, res) => {
  const projects = await listProjects(req.user);

  res.status(200).json(new ApiResponse(200, projects, "Projects fetched successfully"));
});

export const getOne = asyncWrapper(async (req, res) => {
  const project = await getProjectById(req.params.id, req.user);

  res.status(200).json(new ApiResponse(200, project, "Project fetched successfully"));
});

export const updateTeam = asyncWrapper(async (req, res) => {
  const project = await updateProjectTeam(req.params.id, req.body, req.user);

  res.status(200).json(new ApiResponse(200, project, "Project team updated successfully"));
});

export const getTasks = asyncWrapper(async (req, res) => {
  const tasks = await listProjectTasks(req.params.id, req.user);

  res.status(200).json(new ApiResponse(200, tasks, "Tasks fetched successfully"));
});

export const assignTask = asyncWrapper(async (req, res) => {
  const task = await createTask(req.body, req.user);

  res.status(201).json(new ApiResponse(201, task, "Task assigned successfully"));
});

export const start = asyncWrapper(async (req, res) => {
  const task = await startTask(req.params.id, req.user);

  res.status(200).json(new ApiResponse(200, task, "Task started"));
});

export const stop = asyncWrapper(async (req, res) => {
  const task = await stopTask(req.params.id, req.user);

  res.status(200).json(new ApiResponse(200, task, "Task stopped"));
});
