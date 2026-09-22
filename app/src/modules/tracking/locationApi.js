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

/** `POST /location/consent` — append the caller's decision on the disclosure (§7.73). */
export function recordConsent({ decision, disclosureVersion, appVersion, deviceId }) {
  return apiClient.post(API_PATHS.LOCATION_CONSENT, { decision, disclosureVersion, appVersion, deviceId });
}

/** `GET /location/consent/me` — the caller's latest decision, or null. */
export function getMyConsent() {
  return apiClient.get(API_PATHS.LOCATION_CONSENT_ME);
}
