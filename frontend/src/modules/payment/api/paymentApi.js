import apiClient from "../../../services/apiClient";

/**
 * Thin wrapper over the shared apiClient for the Payments endpoint,
 * matching the `lead`/`customer` modules' `api/*Api.js` pattern.
 * `GET /payments` now takes optional `from`/`to`/`page`/`limit` — the first
 * real server-side pagination in this backend (payment.service.js's own
 * comment explains why); omitting `filters` (as `PaymentsThisMonthWidget`
 * still does) returns every matching row, unpaginated.
 */

export function listPayments(filters) {
  return apiClient.get("/payments", { params: filters });
}

export function createPayment(payload) {
  return apiClient.post("/payments", payload);
}

export function updatePayment(paymentId, payload) {
  return apiClient.patch(`/payments/${paymentId}`, payload);
}

export function deletePayment(paymentId, reason) {
  return apiClient.delete(`/payments/${paymentId}`, { data: { reason } });
}

export function getPaymentAuditLog(paymentId) {
  return apiClient.get(`/payments/${paymentId}/audit-log`);
}
