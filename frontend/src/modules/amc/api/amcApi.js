import apiClient from "../../../services/apiClient";

/**
 * Thin wrapper over the shared apiClient for the AMC endpoint this codebase
 * currently consumes (`AmcRenewalsDueWidget`, §7.21's Dashboard widgets) —
 * matching the `lead`/`customer` modules' `api/*Api.js` pattern. `amc`
 * itself has no real frontend module yet (still a routing placeholder, see
 * `frontend/README.md`); more functions belong here once that module's own
 * frontend task is built, mirroring `backend/src/modules/amc/amc.routes.js`'s
 * full surface. No filter params — `GET /amc` takes none, scoping is
 * entirely server-side based on the caller (`amc.service.js#listAMC`).
 */

export function listAmc() {
  return apiClient.get("/amc");
}
