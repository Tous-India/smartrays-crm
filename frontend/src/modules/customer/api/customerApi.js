import apiClient from "../../../services/apiClient";

/**
 * Thin wrappers over the shared apiClient for every backend Customers
 * endpoint (`.context/final-plan.md` §7.2 /
 * `backend/src/modules/customer/customer.routes.js`). No logic lives here —
 * just the HTTP calls, matching the `lead` module's `api/leadApi.js` pattern.
 *
 * Deliberately NOT here: `GET /customers/:id/invoices` and
 * `GET /customers/:id/ledger` — neither exists on the backend yet (`Invoice`
 * is a placeholder model, real invoicing is a future phase). The Customer
 * Detail page's "Invoice History" placeholder section that used to stand in
 * for them was removed outright on 2026-08-05, since it could never show
 * real data — see `frontend/README.md`.
 */

export function listCustomers(filters) {
  return apiClient.get("/customers", { params: filters });
}

export function getCustomer(id) {
  return apiClient.get(`/customers/${id}`);
}

export function createCustomer(payload) {
  return apiClient.post("/customers", payload);
}

export function updateCustomer(id, payload) {
  return apiClient.patch(`/customers/${id}`, payload);
}

export function deleteCustomer(id) {
  return apiClient.delete(`/customers/${id}`);
}

export function bulkUpdateCustomers({ ids, action }) {
  return apiClient.post("/customers/bulk", { ids, action });
}

// --- Contacts ---------------------------------------------------------

export function listContacts(customerId) {
  return apiClient.get(`/customers/${customerId}/contacts`);
}

export function createContact(customerId, payload) {
  return apiClient.post(`/customers/${customerId}/contacts`, payload);
}

export function updateContact(customerId, contactId, payload) {
  return apiClient.patch(`/customers/${customerId}/contacts/${contactId}`, payload);
}

export function deleteContact(customerId, contactId) {
  return apiClient.delete(`/customers/${customerId}/contacts/${contactId}`);
}

// --- Contracts (trigger backend project/invoice automation) -----------

export function listContracts(customerId) {
  return apiClient.get(`/customers/${customerId}/contracts`);
}

export function createContract(customerId, payload) {
  return apiClient.post(`/customers/${customerId}/contracts`, payload);
}

export function updateContract(customerId, contractId, payload) {
  return apiClient.patch(`/customers/${customerId}/contracts/${contractId}`, payload);
}

export function deleteContract(customerId, contractId) {
  return apiClient.delete(`/customers/${customerId}/contracts/${contractId}`);
}

// --- Credentials (masked by default; reveal is a separate, audited call) ---

export function listCredentials(customerId) {
  return apiClient.get(`/customers/${customerId}/credentials`);
}

export function createCredential(customerId, payload) {
  return apiClient.post(`/customers/${customerId}/credentials`, payload);
}

export function updateCredential(customerId, credentialId, payload) {
  return apiClient.patch(`/customers/${customerId}/credentials/${credentialId}`, payload);
}

export function deleteCredential(customerId, credentialId) {
  return apiClient.delete(`/customers/${customerId}/credentials/${credentialId}`);
}

export function revealCredential(customerId, credentialId) {
  return apiClient.post(`/customers/${customerId}/credentials/${credentialId}/reveal`);
}

// --- Activity log -------------------------------------------------------

export function listActivity(customerId) {
  return apiClient.get(`/customers/${customerId}/activity`);
}
