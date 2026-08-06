import asyncWrapper from "../../utils/asyncWrapper.js";
import { getOwnPermissions, updateOwnProfile, setCanEditOwnProfile } from "./user.service.js";
import ApiResponse from "../../utils/ApiResponse.js";
import {
  listUsers,
  getUserById,
  listUsersForDropdown,
  updateUser,
  setUserActiveStatus,
  getDeactivationImpact,
  assignManager,
  adminResetPassword,
  hardDeleteUser,
} from "./user.service.js";

export const list = asyncWrapper(async (req, res) => {
  const users = await listUsers(req.query, req.user);

  res.status(200).json(new ApiResponse(200, users, "Users fetched successfully"));
});

export const dropdown = asyncWrapper(async (req, res) => {
  const users = await listUsersForDropdown();

  res.status(200).json(new ApiResponse(200, users, "User picker list fetched successfully"));
});

export const getOne = asyncWrapper(async (req, res) => {
  const user = await getUserById(req.params.id, req.user);

  res.status(200).json(new ApiResponse(200, user, "User fetched successfully"));
});

export const update = asyncWrapper(async (req, res) => {
  const user = await updateUser(req.params.id, req.body, req.user);

  res.status(200).json(new ApiResponse(200, user, "User updated successfully"));
});

export const deactivate = asyncWrapper(async (req, res) => {
  const user = await setUserActiveStatus(req.params.id, false, req.body);

  res.status(200).json(new ApiResponse(200, user, "User deactivated successfully"));
});

export const deactivationImpact = asyncWrapper(async (req, res) => {
  const impact = await getDeactivationImpact(req.params.id);

  res.status(200).json(new ApiResponse(200, impact, "Deactivation impact fetched successfully"));
});

export const reactivate = asyncWrapper(async (req, res) => {
  const user = await setUserActiveStatus(req.params.id, true);

  res.status(200).json(new ApiResponse(200, user, "User reactivated successfully"));
});

export const changeManager = asyncWrapper(async (req, res) => {
  const user = await assignManager(req.params.id, req.body.managerId);

  res.status(200).json(new ApiResponse(200, user, "Manager assigned successfully"));
});

export const hardDelete = asyncWrapper(async (req, res) => {
  await hardDeleteUser(req.params.id, req.body.reason, req.user);

  res.status(200).json(new ApiResponse(200, null, "User permanently deleted"));
});

export const resetPassword = asyncWrapper(async (req, res) => {
  const { user, tempPassword } = await adminResetPassword(req.params.id, req.body.newPassword);

  res
    .status(200)
    .json(new ApiResponse(200, { user, tempPassword }, "Password reset successfully"));
});

// --- Employee self-service (§7.39, 2026-08-05) ---

export const getMyPermissions = asyncWrapper(async (req, res) => {
  const result = await getOwnPermissions(req.user._id);

  res.status(200).json(new ApiResponse(200, result, "Your permissions fetched successfully"));
});

export const updateMe = asyncWrapper(async (req, res) => {
  const user = await updateOwnProfile(req.user._id, req.body);

  res.status(200).json(new ApiResponse(200, user, "Profile updated successfully"));
});

export const toggleCanEditOwnProfile = asyncWrapper(async (req, res) => {
  const user = await setCanEditOwnProfile(req.params.id, req.body.canEditOwnProfile, req.user);

  res.status(200).json(new ApiResponse(200, user, "Profile-editing permission updated"));
});
