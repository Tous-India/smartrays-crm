import apiClient from "../../../api/apiClient";

/**
 * Live employee status (2026-10-23) — the server works out each person's
 * status (Moving, Stationary, At site, Offline, Location off, Disconnected…)
 * from the pings and what the phone reports; the app only shows it.
 */

/** `GET /location/live-status` — everyone the caller may see, problems first, plus the counts. */
export function getTeamLiveStatus() {
  return apiClient.get("/location/live-status");
}

/** `GET /location/my-status` — my own status and a fix-it hint. */
export function getMyLiveStatus() {
  return apiClient.get("/location/my-status");
}

/** `GET /location/timeline` — one person's day; `date` YYYY-MM-DD (India). */
export function getDayTimeline(employeeId, date) {
  return apiClient.get("/location/timeline", { params: { employeeId, date } });
}

/** `POST /location/status-events` — "location off / on", as soon as there is internet. */
export function postStatusEvents(events) {
  return apiClient.post("/location/status-events", { events });
}
