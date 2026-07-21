import apiClient from "../../../services/apiClient";

/**
 * Thin wrapper over the shared apiClient for the Tickets endpoint this
 * codebase currently consumes (`TicketsOpenWidget`, §7.21's Dashboard
 * widgets) — matching the `lead`/`customer` modules' `api/*Api.js` pattern.
 * `ticket` itself has no real frontend module yet (still a routing
 * placeholder, see `frontend/README.md`); more functions belong here once
 * that module's own frontend task is built, mirroring
 * `backend/src/modules/ticket/ticket.routes.js`'s full surface.
 */

export function listTickets(scope) {
  return apiClient.get("/tickets", { params: { scope } });
}
