import apiClient from "../../../services/apiClient";

/**
 * Thin wrapper over the shared apiClient for the Payments endpoint this
 * codebase currently consumes (`PaymentsThisMonthWidget`, §7.21's Dashboard
 * widgets) — matching the `lead`/`customer` modules' `api/*Api.js` pattern.
 * `payment` itself has no real frontend module yet (still a routing
 * placeholder, see `frontend/README.md`); more functions belong here once
 * that module's own frontend task is built, mirroring
 * `backend/src/modules/payment/payment.routes.js`'s full surface. No filter
 * params — `GET /payments` takes none (admin-only, no ownership scoping at
 * all, per §5's matrix).
 */

export function listPayments() {
  return apiClient.get("/payments");
}
