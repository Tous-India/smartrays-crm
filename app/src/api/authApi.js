import apiClient from "./apiClient";
import { API_PATHS, TRUSTED_DEVICE_HEADER } from "../constants/api.constants";

/**
 * The auth endpoints, one function each — thin wrappers so screens never
 * spell out a path. Every call returns the axios response; the caller reads
 * `response.data.data`, the backend's envelope.
 */

/**
 * POST /auth/mobile/login. The trusted-device token (if this install has
 * one) goes as a header; the server consults it only after the password
 * verifies, exactly as it does the web's cookie.
 */
export function loginMobile({ email, password, deviceId, deviceLabel }, trustedDeviceToken) {
  const headers = trustedDeviceToken ? { [TRUSTED_DEVICE_HEADER]: trustedDeviceToken } : {};

  return apiClient.post(API_PATHS.MOBILE_LOGIN, { email, password, deviceId, deviceLabel }, { headers });
}

/** POST /auth/mobile/2fa/verify — the pre-auth token is the only credential this call has. */
export function verifyTwoFactorMobile(preAuthToken, { token, rememberDevice, deviceId, deviceLabel }) {
  return apiClient.post(
    API_PATHS.MOBILE_TWO_FACTOR_VERIFY,
    { token, rememberDevice, deviceId, deviceLabel },
    { headers: { Authorization: `Bearer ${preAuthToken}` } }
  );
}

export function fetchCurrentUser() {
  return apiClient.get(API_PATHS.CURRENT_USER);
}

/** Revokes THIS install's refresh token; the access token runs out on its own. */
export function logoutMobile(refreshToken) {
  return apiClient.post(API_PATHS.MOBILE_LOGOUT, { refreshToken });
}
