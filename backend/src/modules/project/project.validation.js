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
