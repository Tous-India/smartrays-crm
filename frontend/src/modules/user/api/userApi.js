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

// GET /users/:id (§7.32) — already existed for the roster's own scoping
// rules (self always allowed, otherwise view_team/view_all), just never had
// a frontend wrapper before since UserManagementPage only ever needed the
// list endpoint. Backs the new User Detail page's header + Basic Info card.
export function getUser(id) {
  return apiClient.get(`/users/${id}`);
}

export function updateUser(id, payload) {
  return apiClient.patch(`/users/${id}`, payload);
}

// `reassignments` (§7.31) — optional `{ reassignTeamsTo, reassignLeadsTo }`,
// only ever needed when `getDeactivationImpact` below returned something to
// resolve. Omitted entirely, this behaves exactly as it did before that
// feature existed.
export function deactivateUser(id, reassignments) {
  return apiClient.patch(`/users/${id}/deactivate`, reassignments);
}

// GET /users/:id/deactivation-impact (§7.31) — what needs reassigning
// before this person can be deactivated (led teams, active-lead count).
export function getDeactivationImpact(id) {
  return apiClient.get(`/users/${id}/deactivation-impact`);
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
