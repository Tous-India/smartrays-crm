import apiClient from "../../../services/apiClient";

/**
 * Thin wrapper over the shared apiClient for the Teams endpoint, matching
 * the `payment`/`lead`/`customer` modules' own `api/*Api.js` pattern.
 */

export function listTeams(filters) {
  return apiClient.get("/teams", { params: filters });
}

export function getTeam(teamId) {
  return apiClient.get(`/teams/${teamId}`);
}

export function createTeam(payload) {
  return apiClient.post("/teams", payload);
}

export function updateTeam(teamId, payload) {
  return apiClient.patch(`/teams/${teamId}`, payload);
}

export function deleteTeam(teamId) {
  return apiClient.delete(`/teams/${teamId}`);
}

export function getTeamMembers(teamId) {
  return apiClient.get(`/teams/${teamId}/members`);
}

export function addTeamMember(teamId, userId) {
  return apiClient.post(`/teams/${teamId}/members`, { userId });
}

export function removeTeamMember(teamId, userId) {
  return apiClient.delete(`/teams/${teamId}/members/${userId}`);
}

// GET /team-types (§7.30) — the admin-managed team type list, lazily seeded
// server-side on first fetch, the same pattern as `getLeadSources` above.
export function getTeamTypes() {
  return apiClient.get("/team-types");
}

/**
 * The caller's OWN team (§7.39) — authenticate-only, no `teams.*` grant
 * needed. `GET /teams` requires manage/view_team, neither of which an
 * employee holds, so the employee Team page depends on this endpoint.
 */
export function getMyTeam() {
  return apiClient.get("/teams/mine");
}

export function setTeamShowContacts(teamId, showContactsToMembers) {
  return apiClient.patch(`/teams/${teamId}/show-contacts`, { showContactsToMembers });
}
