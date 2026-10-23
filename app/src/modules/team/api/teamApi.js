import apiClient from "../../../api/apiClient";
import { API_PATHS } from "../../../constants/api.constants";

/**
 * The manager's Team tab reads the web's own endpoints (app-plan.md §2);
 * every one of them is scoped server-side to the caller's direct reports,
 * so the app sends nothing about who the team is.
 */

/** `GET /users?managerId=<me>&isActive=true` — the direct reports, by name. */
export function listDirectReports(managerId) {
  return apiClient.get(API_PATHS.USERS, { params: { managerId, isActive: true } });
}

/** `GET /attendance/team?month=` — the team's records; photos only when the caller may see them. */
export function getTeamAttendance(month) {
  return apiClient.get(API_PATHS.TEAM_ATTENDANCE, { params: { month } });
}

/** `GET /location/live` — `{ entries, unlocatable, openShiftCount }` for the team. */
export function getLiveLocations() {
  return apiClient.get(API_PATHS.LOCATION_LIVE);
}

/** `GET /leave?scope=team` — the team's leave requests. */
export function listTeamLeaves() {
  return apiClient.get(API_PATHS.LEAVE, { params: { scope: "team" } });
}

/** `PATCH /leave/:id/approve` (2026-10-23) — the server checks the request is the caller's team's. */
export function approveLeave(leaveId) {
  return apiClient.patch(`${API_PATHS.LEAVE}/${leaveId}/approve`);
}

/** `PATCH /leave/:id/decline` — an optional reason, shown to the employee. */
export function declineLeave(leaveId, reason) {
  return apiClient.patch(`${API_PATHS.LEAVE}/${leaveId}/decline`, reason ? { reason } : {});
}

/** `GET /services/assignees` — who the caller may assign to; the picker's ONLY source. */
export function listAssignees() {
  return apiClient.get(API_PATHS.SERVICE_ASSIGNEES);
}

/** `POST /services` — `{ title, description, assignedToId, dueDate, subtasks: [{ title }] }`. */
export function createService(payload) {
  return apiClient.post(API_PATHS.SERVICES, payload);
}

/** `PATCH /services/:id` — fields and reassignment; status goes through the status endpoint. */
export function updateService(serviceId, payload) {
  return apiClient.patch(`${API_PATHS.SERVICES}/${serviceId}`, payload);
}
