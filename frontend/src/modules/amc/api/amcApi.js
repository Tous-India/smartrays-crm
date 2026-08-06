import apiClient from "../../../services/apiClient";

/**
 * Thin wrapper over the AMC endpoints, matching the `lead`/`customer`
 * modules' `api/*Api.js` pattern.
 *
 * Consumed by the Dashboard's `AmcRenewalsDueWidget` (§7.21) and — since
 * 2026-08-05 — by the Customer Detail page's own AMC section, which is where
 * AMC now lives. The standalone `/amc` page was retired that same day; this
 * api module deliberately SURVIVED that removal, because the Dashboard
 * widget and the Reports module still read from it. Scoping is entirely
 * server-side based on the caller (`amc.service.js#listAMC`); `customerId`
 * below narrows WITHIN that scope, it never widens it.
 */

export function listAmc(params = {}) {
  return apiClient.get("/amc", { params });
}

export function listAmcForCustomer(customerId) {
  return apiClient.get("/amc", { params: { customerId } });
}

/**
 * Everything renewing within 30 days OR already overdue, across every
 * customer the caller can see (§7.42). Each record carries `customerName`
 * from the same query — no per-row lookup.
 */
export function listExpiringAmc() {
  return apiClient.get("/amc", { params: { expiringSoon: true } });
}

/**
 * Closes the current term and opens the next one as a NEW record — the old
 * record's amount and dates are never mutated (see
 * `backend/src/modules/amc/amc.service.js#renewAMC`). Every field in
 * `payload` is optional; omitting them all takes the server's derived
 * defaults (start where the old term ended, run one year, same amount).
 */
export function renewAmc(amcId, payload = {}) {
  return apiClient.post(`/amc/${amcId}/renew`, payload);
}
