import asyncWrapper from "../../utils/asyncWrapper.js";
import ApiResponse from "../../utils/ApiResponse.js";
import {
  getRegistry,
  listTemplates,
  getOrCreateTemplate,
  updateTemplate,
  getUserPermissions,
  updateUserPermissions,
  resetUserPermissions,
} from "./permission.service.js";

export const registry = asyncWrapper(async (req, res) => {
  res.status(200).json(new ApiResponse(200, getRegistry(), "Permission registry fetched successfully"));
});

export const listAllTemplates = asyncWrapper(async (req, res) => {
  const templates = await listTemplates();

  res.status(200).json(new ApiResponse(200, templates, "Templates fetched successfully"));
});

export const getTemplate = asyncWrapper(async (req, res) => {
  const template = await getOrCreateTemplate(req.params.role);

  res.status(200).json(new ApiResponse(200, template, "Template fetched successfully"));
});

export const editTemplate = asyncWrapper(async (req, res) => {
  const template = await updateTemplate(req.params.role, req.body.permissions, req.user);

  res.status(200).json(new ApiResponse(200, template, "Template updated successfully"));
});

export const getUserPerms = asyncWrapper(async (req, res) => {
  const permissions = await getUserPermissions(req.params.id);

  res.status(200).json(new ApiResponse(200, permissions, "User permissions fetched successfully"));
});

export const editUserPerms = asyncWrapper(async (req, res) => {
  const user = await updateUserPermissions(req.params.id, req.body.permissions);

  res.status(200).json(new ApiResponse(200, user, "User permissions updated successfully"));
});

export const resetUserPerms = asyncWrapper(async (req, res) => {
  const user = await resetUserPermissions(req.params.id);

  res.status(200).json(new ApiResponse(200, user, "User permissions reset to role template"));
});
