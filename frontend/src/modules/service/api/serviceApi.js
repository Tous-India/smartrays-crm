import apiClient from "../../../services/apiClient";

/**
 * Services (§7.72) — internal work items. Every list/fetch is scoped by the
 * SERVER to the caller (admin: all; manager: own team + self; anyone else:
 * own). The client never filters for visibility; it only narrows.
 */

export function listServices(filters) {
  return apiClient.get("/services", { params: filters });
}

/** Who the caller may assign to — the picker's only source (§7.72). */
export function listAssignees() {
  return apiClient.get("/services/assignees");
}

export function getService(id) {
  return apiClient.get(`/services/${id}`);
}

export function createService(payload) {
  return apiClient.post("/services", payload);
}

export function updateService(id, payload) {
  return apiClient.patch(`/services/${id}`, payload);
}

export function changeServiceStatus(id, status) {
  return apiClient.patch(`/services/${id}/status`, { status });
}

/** Tick one subtask done/undone — assignee or editor (§7.72). */
export function toggleSubtask(id, subtaskId, isDone) {
  return apiClient.patch(`/services/${id}/subtasks/${subtaskId}`, { isDone });
}

export function deleteService(id) {
  return apiClient.delete(`/services/${id}`);
}
