import ApiError from "../../utils/ApiError.js";

export function validateSubscribeInput(req, res, next) {
  const { endpoint, keys } = req.body;

  if (!endpoint || typeof endpoint !== "string") {
    throw new ApiError(400, "endpoint is required");
  }

  if (!keys || !keys.p256dh || !keys.auth) {
    throw new ApiError(400, "keys.p256dh and keys.auth are required");
  }

  next();
}

export function validateUnsubscribeInput(req, res, next) {
  if (!req.body.endpoint || typeof req.body.endpoint !== "string") {
    throw new ApiError(400, "endpoint is required");
  }

  next();
}
