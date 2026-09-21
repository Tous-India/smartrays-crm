import ApiError from "../../utils/ApiError.js";

/**
 * Validates the body of POST /auth/mobile/refresh and /auth/mobile/logout —
 * both carry the refresh token in the body, never in a header, because it is
 * not a session credential and must not look like one.
 */
export function validateRefreshTokenInput(req, res, next) {
  const { refreshToken } = req.body || {};

  if (!refreshToken || typeof refreshToken !== "string") {
    throw new ApiError(400, "refreshToken is required");
  }

  next();
}

/**
 * The optional device fields the app sends with a login / 2FA verification.
 * Both are free text the app controls; the only rule is "a string, if sent".
 */
export function validateDeviceFieldsInput(req, res, next) {
  const { deviceId, deviceLabel } = req.body || {};

  if (deviceId !== undefined && typeof deviceId !== "string") {
    throw new ApiError(400, "deviceId must be a string");
  }

  if (deviceLabel !== undefined && typeof deviceLabel !== "string") {
    throw new ApiError(400, "deviceLabel must be a string");
  }

  next();
}
