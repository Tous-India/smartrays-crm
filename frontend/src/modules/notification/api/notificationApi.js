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

/*
 * The scoped `markNotificationsReadByType` wrapper was REMOVED (§7.43,
 * 2026-08-06). Its only caller was the sidebar nav-click auto-clear, which
 * marked every unread notification of a type read merely because the user
 * clicked a nav item — the cause of "the admin never receives leave
 * notifications" (the record was created and delivered correctly, then
 * dismissed by a navigation).
 *
 * The backend endpoint is unchanged and still accepts `?type=`; it is correct
 * for an explicit scoped dismissal and may be wanted again. The wrapper is
 * gone so the auto-clear cannot be re-wired without deliberately re-adding
 * it.
 */
