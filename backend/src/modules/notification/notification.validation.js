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

import { DEVICE_PLATFORMS } from "./deviceToken.model.js";

/** POST /notifications/devices — `{ token, platform?, deviceId?, appVersion? }`. */
export function validateRegisterDeviceInput(req, res, next) {
  const { token, platform, deviceId, appVersion } = req.body || {};

  if (!token || typeof token !== "string" || !token.trim()) {
    throw new ApiError(400, "token is required");
  }

  if (platform !== undefined && !DEVICE_PLATFORMS.includes(platform)) {
    throw new ApiError(400, `platform must be one of: ${DEVICE_PLATFORMS.join(", ")}`);
  }

  [
    ["deviceId", deviceId],
    ["appVersion", appVersion],
  ].forEach(([name, value]) => {
    if (value !== undefined && value !== null && typeof value !== "string") {
      throw new ApiError(400, `${name} must be a string`);
    }
  });

  next();
}
