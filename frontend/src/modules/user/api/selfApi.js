import apiClient from "../../../services/apiClient";

/**
 * Employee self-service (§7.39, 2026-08-05). These are SEPARATE endpoints
 * from the admin-only per-user ones — they never widen those.
 */
export function fetchMyPermissions() {
  return apiClient.get("/users/me/permissions");
}

/**
 * Only ever send fields the server's whitelist accepts. It REJECTS anything
 * else with a 403/400 rather than ignoring it, so a stray field here fails
 * the whole request instead of silently doing nothing.
 */
export function updateMyProfile(payload) {
  return apiClient.patch("/users/me", payload);
}

export function setCanEditOwnProfile(userId, canEditOwnProfile) {
  return apiClient.patch(`/users/${userId}/can-edit-own-profile`, { canEditOwnProfile });
}
