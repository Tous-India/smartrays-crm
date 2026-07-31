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

// `types` (added §7.29 — Leads/Leave sidebar badges) — an array, joined into
// the same comma-separated `?type=` param the backend already parses for
// GET /notifications. Used to fetch just the unread count for one badge's
// types, reusing this one endpoint rather than a dedicated count endpoint.
export function listNotificationsByType(types, { unreadOnly = false } = {}) {
  return apiClient.get("/notifications", {
    params: { type: types.join(","), unreadOnly: unreadOnly ? "true" : undefined },
  });
}

export function markNotificationRead(id) {
  return apiClient.patch(`/notifications/${id}/read`);
}

export function markAllNotificationsRead() {
  return apiClient.patch("/notifications/read-all");
}

// Scoped mark-as-read for the Leads/Leave sidebar nav-click behavior (§7.29)
// — marks only the given type(s) read, leaving unrelated unread
// notifications (and the bell's own "Mark all as read" scope) untouched.
export function markNotificationsReadByType(types) {
  return apiClient.patch("/notifications/read-all", null, { params: { type: types.join(",") } });
}
