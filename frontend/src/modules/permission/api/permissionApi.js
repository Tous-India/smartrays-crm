import apiClient from "../../../services/apiClient";

/**
 * Thin wrappers over the shared apiClient for the backend `permission`
 * module (`backend/src/modules/permission/permission.routes.js`) — role
 * templates + per-user overrides. No logic lives here — just the HTTP
 * calls, per §9's "API file per feature" convention.
 */

export function getPermissionRegistry() {
  return apiClient.get("/permissions/registry");
}

export function getRoleTemplate(role) {
  return apiClient.get(`/permissions/templates/${role}`);
}

export function updateRoleTemplate(role, permissions) {
  return apiClient.patch(`/permissions/templates/${role}`, { permissions });
}

export function getUserPermissions(userId) {
  return apiClient.get(`/users/${userId}/permissions`);
}

export function updateUserPermissions(userId, permissions) {
  return apiClient.patch(`/users/${userId}/permissions`, { permissions });
}

export function resetUserPermissions(userId) {
  return apiClient.post(`/users/${userId}/permissions/reset`);
}
