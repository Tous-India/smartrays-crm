import apiClient from "../../../services/apiClient";

/**
 * Customer complaints (2026-10-23) — one public form for every customer (no
 * login) and the staff endpoints under /complaints.
 */

// --- public, no login ---
export function submitPublicComplaint(formData) {
  return apiClient.post("/public/complaints", formData);
}

export function getPublicComplaintStatus(token) {
  return apiClient.get(`/public/complaints/status/${encodeURIComponent(token)}`);
}

// --- staff ---
export function listComplaints(filter) {
  return apiClient.get("/complaints", { params: filter ? { filter } : {} });
}

export function getComplaint(id) {
  return apiClient.get(`/complaints/${id}`);
}

export function listComplaintAssignees() {
  return apiClient.get("/complaints/assignees");
}

export function assignComplaint(id, { assignedToId, priority, visitDate }) {
  return apiClient.patch(`/complaints/${id}/assign`, { assignedToId, priority, visitDate });
}

export function changeComplaintStatus(id, status, note) {
  return apiClient.patch(`/complaints/${id}/status`, note ? { status, note } : { status });
}

export function addComplaintPhoto(id, file) {
  const form = new FormData();
  form.append("photo", file);
  return apiClient.post(`/complaints/${id}/photos`, form);
}

export function sendComplaintBack(id, reason) {
  return apiClient.post(`/complaints/${id}/send-back`, { reason });
}
