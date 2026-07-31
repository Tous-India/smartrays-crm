import apiClient from "../../../services/apiClient";

/**
 * Thin wrappers over the shared apiClient for every backend `user` +
 * account-creation endpoint this module's frontend consumes
 * (`backend/src/modules/user/user.routes.js`, `POST /auth/register`). No
 * logic lives here — just the HTTP calls, per §9's "API file per feature"
 * convention.
 */

export function listUsers(filters) {
  return apiClient.get("/users", { params: filters });
}

export function updateUser(id, payload) {
  return apiClient.patch(`/users/${id}`, payload);
}

export function deactivateUser(id) {
  return apiClient.patch(`/users/${id}/deactivate`);
}

export function reactivateUser(id) {
  return apiClient.patch(`/users/${id}/reactivate`);
}

export function adminResetPassword(id, payload) {
  return apiClient.patch(`/users/${id}/reset-password`, payload);
}

// Guarded, permanent hard-delete (§7.28) — only ever enabled in the UI for
// an already-Inactive user; the backend re-enforces that same guard (plus
// team-head and reason-required) regardless.
export function deleteUser(id, reason) {
  return apiClient.delete(`/users/${id}`, { data: { reason } });
}

// Account creation lives on the auth module's own route (admin-gated), not a
// separate POST /users — matches the backend's own "one place a user gets
// created" design (see backend/README.md's Auth section).
export function createUser(payload) {
  return apiClient.post("/auth/register", payload);
}
