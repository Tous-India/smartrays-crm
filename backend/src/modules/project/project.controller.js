import asyncWrapper from "../../utils/asyncWrapper.js";
import ApiResponse from "../../utils/ApiResponse.js";
import { listProjects, getProjectById, updateProjectTeam } from "./project.service.js";

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
