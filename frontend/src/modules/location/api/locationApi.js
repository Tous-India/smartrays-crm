import apiClient from "../../../services/apiClient";

/**
 * Thin wrappers over the shared apiClient for the backend Location module
 * (`.context/final-plan.md` §7.4b /
 * `backend/src/modules/location/location.routes.js`).
 *
 * `submitLocationPing`/`fetchLocationConfig` back `useCheckedInHeartbeatLoop`
 * (`attendance/hooks/`) — the confirmed real route is `POST /location/pings`
 * (plural), verified directly against `location.routes.js` before building
 * the loop, not assumed from an earlier summary that also referred to it as
 * plural but hadn't been checked against the route file itself.
 */

export function fetchLiveLocations() {
  return apiClient.get("/location/live");
}

export function fetchLocationHistory({ employeeId, date }) {
  return apiClient.get("/location/history", { params: { employeeId, date } });
}

export function submitLocationPing({ coords, capturedAt }) {
  return apiClient.post("/location/pings", { coords, capturedAt });
}

export function fetchLocationConfig() {
  return apiClient.get("/location/config");
}

/**
 * Ranged, multi-employee history (§7.67) — the SAME endpoint the single-day
 * call uses, with the range/`employeeIds` parameters it gained rather than a
 * parallel route.
 *
 * `employeeIds: "all"` asks for everyone the viewer may see. The server refuses
 * trails for anything other than a single employee and says so via
 * `trailsIncluded`, so the caller never has to guess why `pings` is empty.
 */
export function fetchLocationHistoryRange({ employeeIds, from, to }) {
  return apiClient.get("/location/history", {
    params: {
      ...(employeeIds ? { employeeIds } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    },
  });
}

/**
 * Latest location-consent decision per employee in the caller's scope
 * (§7.73) — the same scoping as the live map; those who never answered are
 * included with `decision: null`.
 */
export function fetchLocationConsents() {
  return apiClient.get("/location/consent");
}
