import { useCallback, useEffect, useState } from "react";
import { listNotifications, markNotificationRead, markAllNotificationsRead } from "../api/notificationApi";
import { announceNotificationsChanged } from "../notificationEvents";

// Within this task's own "~30-60s" stated polling range.
const POLL_INTERVAL_MS = 45000;

/**
 * Backs the notification bell — polls `GET /notifications` (no dedicated
 * unread-count endpoint exists, so this fetches the full list each tick and
 * derives the count client-side) and exposes mark-as-read actions. Browser
 * push subscription is explicitly out of scope for this task; this is
 * in-app polling only.
 *
 * **Refetches on tab visibility return (BUG 2, 2026-08-04)** — a plain
 * `setInterval` with no visibility awareness is exactly what
 * `useCheckedInHeartbeatLoop.js` already documents as a real problem for
 * this app's usage pattern: browsers throttle (sometimes heavily) a
 * backgrounded tab's timers, so a user who switches away and back — the
 * natural way to test "does person B see person A's action," e.g. admin/
 * manager/employee testing together — could wait well past
 * `POLL_INTERVAL_MS` for their next real poll, making it look like polling
 * "doesn't work" until a manual refresh forces a fresh fetch. Unlike that
 * heartbeat hook (which fully pauses/resumes its intervals to save
 * geolocation/battery cost while hidden), this one keeps the interval
 * running as-is — a `GET /notifications` poll is cheap — and just adds one
 * extra trigger: refetch immediately the moment the tab becomes visible
 * again, rather than waiting for however long is left on a possibly
 * browser-delayed interval tick.
 */
export function useNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const refetch = useCallback(async () => {
    try {
      const response = await listNotifications();
      setNotifications(response.data.data);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
    const interval = setInterval(refetch, POLL_INTERVAL_MS);

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        refetch();
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refetch]);

  // Both of these are EXPLICIT user dismissals — opening a notification, or
  // pressing "Mark all as read". Nothing marks read on render, on hover, or
  // on navigation (§7.43). Each announces the change so the sidebar badges
  // update immediately rather than after their own poll interval.
  async function markAsRead(id) {
    await markNotificationRead(id);
    setNotifications((current) =>
      current.map((notification) => (notification._id === id ? { ...notification, isRead: true } : notification))
    );
    announceNotificationsChanged();
  }

  async function markAllAsRead() {
    await markAllNotificationsRead();
    setNotifications((current) => current.map((notification) => ({ ...notification, isRead: true })));
    announceNotificationsChanged();
  }

  const unreadCount = notifications.filter((notification) => !notification.isRead).length;

  return { notifications, unreadCount, isLoading, refetch, markAsRead, markAllAsRead };
}

export default useNotifications;
