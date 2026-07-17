import asyncWrapper from "../../utils/asyncWrapper.js";
import ApiResponse from "../../utils/ApiResponse.js";
import {
  listUsers,
  getUserById,
  listUsersForDropdown,
  updateUser,
  setUserActiveStatus,
  assignManager,
  adminResetPassword,
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
  const user = await setUserActiveStatus(req.params.id, false);

  res.status(200).json(new ApiResponse(200, user, "User deactivated successfully"));
});

export const reactivate = asyncWrapper(async (req, res) => {
  const user = await setUserActiveStatus(req.params.id, true);

  res.status(200).json(new ApiResponse(200, user, "User reactivated successfully"));
});

export const changeManager = asyncWrapper(async (req, res) => {
  const user = await assignManager(req.params.id, req.body.managerId);

  res.status(200).json(new ApiResponse(200, user, "Manager assigned successfully"));
});

export const resetPassword = asyncWrapper(async (req, res) => {
  const { user, tempPassword } = await adminResetPassword(req.params.id, req.body.newPassword);

  res
    .status(200)
    .json(new ApiResponse(200, { user, tempPassword }, "Password reset successfully"));
});
