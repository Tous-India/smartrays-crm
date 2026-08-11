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

/**
 * §7.47 — the monthly leave-and-attendance report behind the Attendance page's
 * Report tab. `month` is 1-based, matching the API rather than dayjs.
 *
 * Gated on `payroll.run`, NOT `payroll.view`: `view` means "own payslip only"
 * and every employee holds it by default, while this returns every employee's
 * salary in one response.
 */
export function getMonthlyReport({ year, month }) {
  return apiClient.get("/payroll/monthly-report", { params: { year, month } });
}
