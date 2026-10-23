import apiClient from "../../../api/apiClient";

/**
 * In-app notifications (2026-10-23) — the same list the web bell reads, so a
 * manager sees "location off" alerts even when push cannot reach the phone.
 */

/** `GET /notifications` — mine, newest first. */
export function listNotifications() {
  return apiClient.get("/notifications");
}

/** `PATCH /notifications/:id/read`. */
export function markNotificationRead(id) {
  return apiClient.patch(`/notifications/${id}/read`);
}

/** `PATCH /notifications/read-all`. */
export function markAllNotificationsRead() {
  return apiClient.patch("/notifications/read-all");
}
