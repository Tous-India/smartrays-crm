import apiClient from "../../../services/apiClient";

/**
 * Thin wrappers over the shared apiClient for the existing backend
 * Notification endpoints (`backend/src/modules/notification/notification.routes.js`).
 * Deliberately NOT here: `/notifications/subscribe` / `/unsubscribe` (browser
 * push) — this module is in-app notifications only, per this task's explicit
 * exclusion of push subscription setup.
 */

export function listNotifications() {
  return apiClient.get("/notifications");
}

export function markNotificationRead(id) {
  return apiClient.patch(`/notifications/${id}/read`);
}

export function markAllNotificationsRead() {
  return apiClient.patch("/notifications/read-all");
}
