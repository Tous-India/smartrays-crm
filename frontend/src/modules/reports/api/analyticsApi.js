import apiClient from "../../../services/apiClient";

/**
 * Thin wrappers over the shared apiClient for the 11 Reports & Analytics
 * endpoints (`backend/src/modules/report/analytics.*`), matching the
 * `lead`/`customer`/`payment` modules' `api/*Api.js` pattern — one function
 * per endpoint, no shared "generic analytics fetch" abstraction, since each
 * endpoint's params/response shape genuinely differs.
 */

export function getLeadsPipeline() {
  return apiClient.get("/reports/analytics/leads-pipeline");
}

export function getLeadsConversion(filters) {
  return apiClient.get("/reports/analytics/leads-conversion", { params: filters });
}

export function getLeadsBySource() {
  return apiClient.get("/reports/analytics/leads-by-source");
}

export function getLeadsByClientType() {
  return apiClient.get("/reports/analytics/leads-by-client-type");
}

export function getCustomersGrowth(filters) {
  return apiClient.get("/reports/analytics/customers-growth", { params: filters });
}

export function getCustomersStatusSplit() {
  return apiClient.get("/reports/analytics/customers-status-split");
}

export function getCustomersContractValue() {
  return apiClient.get("/reports/analytics/customers-contract-value");
}

export function getPaymentsTrend(filters) {
  return apiClient.get("/reports/analytics/payments-trend", { params: filters });
}

export function getAmcRenewalsUpcoming(days) {
  return apiClient.get("/reports/analytics/amc-renewals-upcoming", { params: { days } });
}

export function getAttendanceTrend(filters) {
  return apiClient.get("/reports/analytics/attendance-trend", { params: filters });
}

export function getPayrollCostTrend(filters) {
  return apiClient.get("/reports/analytics/payroll-cost-trend", { params: filters });
}
