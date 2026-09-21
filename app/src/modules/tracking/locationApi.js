import apiClient from "../../api/apiClient";
import { API_PATHS } from "../../constants/api.constants";

/** `GET /location/config` — the ping cadence, decided by the server. */
export function getLocationConfig() {
  return apiClient.get(API_PATHS.LOCATION_CONFIG);
}

/**
 * `POST /location/pings`, batch form (mobile-backend-plan.md §3.2): up to 500
 * fixes, oldest first, each with its client id. The server answers per ping.
 */
export function uploadPingBatch(pings) {
  return apiClient.post(API_PATHS.LOCATION_PINGS, { pings });
}
