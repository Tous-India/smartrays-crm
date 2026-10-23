import apiClient from "../../../api/apiClient";
import { API_PATHS } from "../../../constants/api.constants";

/**
 * Customer complaints (2026-10-23) — the web's /complaints endpoints over
 * Bearer auth. Which complaints come back is the server's decision
 * (assigners: all; anyone else: the ones assigned to them).
 */

const MULTIPART = { headers: { "Content-Type": "multipart/form-data" } };

/** `GET /complaints` — unassigned first, then newest. */
export function listComplaints() {
  return apiClient.get(API_PATHS.COMPLAINTS);
}

/** `GET /complaints/:id` — everything about one; 404 when out of scope. */
export function getComplaint(ticketId) {
  return apiClient.get(`${API_PATHS.COMPLAINTS}/${ticketId}`);
}

/** `GET /complaints/assignees` — every active staff member (assigners only). */
export function listComplaintAssignees() {
  return apiClient.get(`${API_PATHS.COMPLAINTS}/assignees`);
}

/** `PATCH /complaints/:id/assign` — technician, priority, visit date ("YYYY-MM-DD"). */
export function assignComplaint(ticketId, { assignedToId, priority, visitDate }) {
  return apiClient.patch(`${API_PATHS.COMPLAINTS}/${ticketId}/assign`, { assignedToId, priority, visitDate });
}

/** `PATCH /complaints/:id/status` — on_the_way, working or resolved; forward only. */
export function changeComplaintStatus(ticketId, status, note) {
  return apiClient.patch(`${API_PATHS.COMPLAINTS}/${ticketId}/status`, note ? { status, note } : { status });
}

/** `POST /complaints/:id/photos` — one live-camera photo. */
export function addComplaintPhoto(ticketId, photoUri) {
  const form = new FormData();
  form.append("photo", { uri: photoUri, name: "complaint.jpg", type: "image/jpeg" });
  return apiClient.post(`${API_PATHS.COMPLAINTS}/${ticketId}/photos`, form, MULTIPART);
}

/** `POST /complaints/:id/send-back` — back to the assigners, unassigned, with a reason. */
export function sendComplaintBack(ticketId, reason) {
  return apiClient.post(`${API_PATHS.COMPLAINTS}/${ticketId}/send-back`, { reason });
}

/** `PATCH /complaints/:id/customer` — an unknown caller is that customer (assigners). */
export function linkComplaintCustomer(ticketId, customerId) {
  return apiClient.patch(`${API_PATHS.COMPLAINTS}/${ticketId}/customer`, { customerId });
}

/** `POST /complaints/:id/save-contact` — the caller's number becomes the customer's contact. */
export function saveComplaintContact(ticketId) {
  return apiClient.post(`${API_PATHS.COMPLAINTS}/${ticketId}/save-contact`);
}
