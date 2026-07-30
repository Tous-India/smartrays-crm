import apiClient from "../../../services/apiClient";

/**
 * Thin wrapper over the shared apiClient for the Teams endpoint, matching
 * the `payment`/`lead`/`customer` modules' own `api/*Api.js` pattern.
 */

export function listTeams() {
  return apiClient.get("/teams");
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
