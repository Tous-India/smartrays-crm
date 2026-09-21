import apiClient from "./apiClient";
import { API_PATHS } from "../constants/api.constants";

/**
 * The auth endpoints, one function each — thin wrappers so screens never
 * spell out a path. Every call returns the axios response; the caller reads
 * `response.data.data`, the backend's envelope.
 */

export function fetchCurrentUser() {
  return apiClient.get(API_PATHS.CURRENT_USER);
}

/** Revokes THIS install's refresh token; the access token runs out on its own. */
export function logoutMobile(refreshToken) {
  return apiClient.post(API_PATHS.MOBILE_LOGOUT, { refreshToken });
}
