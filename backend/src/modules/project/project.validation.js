import ApiError from "../../utils/ApiError.js";

export function validateTeamUpdateInput(req, res, next) {
  const { action, userId } = req.body;

  if (!["add", "remove"].includes(action)) {
    throw new ApiError(400, "action must be 'add' or 'remove'");
  }

  if (!userId) {
    throw new ApiError(400, "userId is required");
  }

  next();
}

export function validateCreateTaskInput(req, res, next) {
  const { projectId, title, assignedToId } = req.body;

  if (!projectId) {
    throw new ApiError(400, "projectId is required");
  }

  if (!title || !title.trim()) {
    throw new ApiError(400, "title is required");
  }

  if (!assignedToId) {
    throw new ApiError(400, "assignedToId is required");
  }

  next();
}
