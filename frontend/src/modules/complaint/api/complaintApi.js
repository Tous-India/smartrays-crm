import apiClient from "../../../services/apiClient";

/**
 * Complaints (2026-10-22) — the customer complaint link. Public calls (no
 * login) take the link's token; staff calls use the ticket endpoints.
 */

// --- public, no login ---
export function getPublicComplaintPage(token) {
  return apiClient.get(`/public/complaints/${encodeURIComponent(token)}`);
}

export function raisePublicComplaint(token, formData) {
  return apiClient.post(`/public/complaints/${encodeURIComponent(token)}`, formData);
}

// --- staff ---
export function listComplaints(scope) {
  return apiClient.get("/tickets", { params: scope ? { scope } : {} });
}

export function getComplaint(id) {
  return apiClient.get(`/tickets/${id}`);
}

export function changeComplaintStatus(id, status, comment) {
  return apiClient.patch(`/tickets/${id}/status`, comment ? { status, comment } : { status });
}

export function addComplaintComment(id, comment) {
  return apiClient.post(`/tickets/${id}/comments`, { comment });
}

export function reassignComplaint(id, assignedToId) {
  return apiClient.patch(`/tickets/${id}/assign`, { assignedToId });
}

export function getComplaintLink(customerId) {
  return apiClient.get(`/customers/${customerId}/complaint-link`);
}

export function resetComplaintLink(customerId) {
  return apiClient.post(`/customers/${customerId}/complaint-link/reset`);
}
