import ApiError from "../../utils/ApiError.js";

export function validateCreateTeamInput(req, res, next) {
  const { name, headManagerId } = req.body;

  if (!name || !name.trim()) {
    throw new ApiError(400, "name is required");
  }

  if (!headManagerId) {
    throw new ApiError(400, "headManagerId is required");
  }

  next();
}

/**
 * All fields optional on update — a caller might only be renaming a team,
 * or only reassigning its head, not resubmitting every field at once.
 */
export function validateUpdateTeamInput(req, res, next) {
  const { name, headManagerId } = req.body;

  if (name !== undefined && !name.trim()) {
    throw new ApiError(400, "name cannot be empty");
  }

  if (headManagerId !== undefined && !headManagerId) {
    throw new ApiError(400, "headManagerId cannot be cleared — a team always has a head");
  }

  next();
}

export function validateAddMemberInput(req, res, next) {
  if (!req.body.userId) {
    throw new ApiError(400, "userId is required");
  }

  next();
}
