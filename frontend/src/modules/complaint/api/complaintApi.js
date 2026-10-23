import apiClient from "../../../services/apiClient";

/**
 * Customer complaints (2026-10-23) — one public form for every customer (no
 * login) and the staff endpoints under /complaints.
 */

// --- public, no login ---
export function submitPublicComplaint(formData) {
  return apiClient.post("/public/complaints", formData);
}

/** Is this mobile a known customer? Answers only { matched } (2026-10-23). */
export function checkComplaintPhone(phone) {
  return apiClient.post("/public/complaints/check-phone", { phone });
}

/** A customer's own link: the form's prefill (name, contact, phone, address). */
export function getComplaintLinkPrefill(token) {
  return apiClient.get(`/public/complaints/link/${encodeURIComponent(token)}`);
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

/** A customer's OWN complaint link (with a code) — staff share it from the customer's page. */
export function getCustomerComplaintLink(customerId) {
  return apiClient.get(`/customers/${customerId}/complaint-link`);
}

/** Unknown caller (2026-10-23): this complaint is that customer's. */
export function linkComplaintCustomer(id, customerId) {
  return apiClient.patch(`/complaints/${id}/customer`, { customerId });
}

/** …and the caller's name and number become a contact of that customer. */
export function saveComplaintContact(id) {
  return apiClient.post(`/complaints/${id}/save-contact`);
}

export function searchComplaintCustomers(search) {
  return apiClient.get("/complaints/customer-options", { params: { search } });
}
