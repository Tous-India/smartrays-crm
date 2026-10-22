import apiClient from "../../../api/apiClient";
import { API_PATHS } from "../../../constants/api.constants";

/**
 * Customer complaints (2026-10-22) — the web's ticket endpoints over Bearer
 * auth. Which complaints come back is the server's decision (an employee:
 * the ones assigned to them; a manager or admin: all).
 */

/** `GET /tickets` — each row carries `customerName` and `assigneeName`. */
export function listComplaints() {
  return apiClient.get(API_PATHS.TICKETS);
}

/** `GET /tickets/:id` — who to call, what was said, signed photo links. 404 when out of scope. */
export function getComplaint(ticketId) {
  return apiClient.get(`${API_PATHS.TICKETS}/${ticketId}`);
}

/** `PATCH /tickets/:id/status` — the assignee may move their own. */
export function setComplaintStatus(ticketId, status, comment) {
  return apiClient.patch(`${API_PATHS.TICKETS}/${ticketId}/status`, comment ? { status, comment } : { status });
}
