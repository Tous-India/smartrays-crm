import apiClient from "../../../services/apiClient";

/**
 * Thin wrappers over the shared apiClient for every backend Leads endpoint
 * (`.context/final-plan.md` §7.1 / `backend/src/modules/lead/lead.routes.js`).
 * No logic lives here — just the HTTP calls, so hooks/components never touch
 * apiClient directly.
 */

export function listLeads(filters) {
  return apiClient.get("/leads", { params: filters });
}

// Sidebar badge (§7.26) — a lightweight `countDocuments`, not the full list.
export function getLeadCount(filters) {
  return apiClient.get("/leads/count", { params: filters });
}

export function getLead(id) {
  return apiClient.get(`/leads/${id}`);
}

export function createLead(payload) {
  return apiClient.post("/leads", payload);
}

export function updateLead(id, payload) {
  return apiClient.patch(`/leads/${id}`, payload);
}

export function deleteLead(id) {
  return apiClient.delete(`/leads/${id}`);
}

export function changeLeadStatus(id, { status, lostReason }) {
  return apiClient.patch(`/leads/${id}/status`, { status, lostReason });
}

export function toggleHotFlag(id) {
  return apiClient.patch(`/leads/${id}/hot`);
}

export function logLeadCall(id, payload) {
  return apiClient.post(`/leads/${id}/calls`, payload);
}

export function getLeadCallHistory(id) {
  return apiClient.get(`/leads/${id}/calls`);
}

export function convertLeadToCustomer(id, payload) {
  return apiClient.post(`/leads/${id}/convert`, payload);
}

export function importLeads(file) {
  const formData = new FormData();
  formData.append("file", file);

  return apiClient.post("/leads/import", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
}

// responseType: "blob" — the backend streams the .xlsx file directly
// (Content-Disposition: attachment), not a JSON envelope.
export function exportLeads(filters) {
  return apiClient.get("/leads/export", { params: filters, responseType: "blob" });
}

export function getLeadSources() {
  return apiClient.get("/lead-sources");
}
