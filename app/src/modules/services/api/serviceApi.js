import apiClient from "../../../api/apiClient";
import { API_PATHS } from "../../../constants/api.constants";

/**
 * The web's own service endpoints (§7.72), over Bearer auth. WHICH services
 * come back is the server's scope decision — an employee gets their own, a
 * manager their team's and their own; the app sends no filter for that.
 */

/** `GET /services?status=` — `status` is `todo` or `completed`, or omitted for both. */
export function listServices(status) {
  return apiClient.get(API_PATHS.SERVICES, { params: status ? { status } : {} });
}

/** `GET /services/:id` — 404 when out of scope, never 403. */
export function getService(serviceId) {
  return apiClient.get(`${API_PATHS.SERVICES}/${serviceId}`);
}

/** `PATCH /services/:id/status` — the assignee may complete their own without an edit grant. */
export function setServiceStatus(serviceId, status) {
  return apiClient.patch(`${API_PATHS.SERVICES}/${serviceId}/status`, { status });
}

/** `PATCH /services/:id/subtasks/:subtaskId` — same gate as the status change. */
export function setSubtaskDone(serviceId, subtaskId, isDone) {
  return apiClient.patch(`${API_PATHS.SERVICES}/${serviceId}/subtasks/${subtaskId}`, { isDone });
}
