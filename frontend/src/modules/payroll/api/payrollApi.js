import apiClient from "../../../services/apiClient";

/**
 * Thin wrapper over the shared apiClient for the Payroll endpoint this
 * codebase currently consumes (`PayrollStatusWidget`, §7.21's Dashboard
 * widgets) — matching the `lead`/`customer` modules' `api/*Api.js` pattern.
 * `payroll` itself has no real frontend module yet (still a routing
 * placeholder, see `frontend/README.md`); more functions belong here once
 * that module's own frontend task is built, mirroring
 * `backend/src/modules/payroll/payroll.routes.js`'s full surface.
 */

export function listPayroll({ scope, month }) {
  return apiClient.get("/payroll", { params: { scope, month } });
}
