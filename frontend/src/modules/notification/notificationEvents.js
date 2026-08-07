/**
 * Broadcast when notifications are marked read, so every independent reader
 * of `GET /notifications` can refresh (§7.43, 2026-08-06).
 *
 * The bell (`useNotifications`) and the sidebar badges
 * (`useSidebarBadgeCounts`) poll the same endpoint on separate intervals with
 * no shared store between them. Before this, dismissing something in the bell
 * left the sidebar badge showing the old count for up to a full poll
 * interval, and the two visibly disagreed.
 *
 * A window event rather than lifting state into a store: the two hooks stay
 * decoupled, neither imports the other, and nothing else in the app needs to
 * know this coordination exists. This app already reserves Zustand for
 * genuine cross-page state (§3), which a transient refresh ping is not.
 */
export const NOTIFICATIONS_CHANGED_EVENT = "smartrays:notifications-changed";

export function announceNotificationsChanged() {
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
}
