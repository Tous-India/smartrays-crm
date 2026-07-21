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
