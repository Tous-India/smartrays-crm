import apiClient from "../../../api/apiClient";
import { API_PATHS } from "../../../constants/api.constants";

/**
 * The web's own leave endpoints (§7.5), over Bearer auth. Balance and
 * statuses are whatever the server says; the app computes no leave rule.
 */

/** `GET /leave/balance` — this month's paid-leave used / limit / remaining, as the server counts them. */
export function getLeaveBalance() {
  return apiClient.get(API_PATHS.LEAVE_BALANCE);
}

/** `GET /leave?scope=own` — the caller's own requests, newest first. */
export function listMyLeaves() {
  return apiClient.get(API_PATHS.LEAVE, { params: { scope: "own" } });
}

/**
 * `POST /leave/request` — `{ startDate, endDate, type, isHalfDay, reason }`.
 * The server validates (dates, half-day on one day, the reason) and answers
 * with its own message when it refuses.
 */
export function requestLeave(payload) {
  return apiClient.post(API_PATHS.LEAVE_REQUEST, payload);
}
