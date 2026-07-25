import { useCallback, useEffect, useState } from "react";
import { listNotifications, markNotificationRead, markAllNotificationsRead } from "../api/notificationApi";

// Within this task's own "~30-60s" stated polling range.
const POLL_INTERVAL_MS = 45000;

/**
 * Backs the notification bell — polls `GET /notifications` (no dedicated
 * unread-count endpoint exists, so this fetches the full list each tick and
 * derives the count client-side) and exposes mark-as-read actions. Browser
 * push subscription is explicitly out of scope for this task; this is
 * in-app polling only.
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

    return () => clearInterval(interval);
  }, [refetch]);

  async function markAsRead(id) {
    await markNotificationRead(id);
    setNotifications((current) =>
      current.map((notification) => (notification._id === id ? { ...notification, isRead: true } : notification))
    );
  }

  async function markAllAsRead() {
    await markAllNotificationsRead();
    setNotifications((current) => current.map((notification) => ({ ...notification, isRead: true })));
  }

  const unreadCount = notifications.filter((notification) => !notification.isRead).length;

  return { notifications, unreadCount, isLoading, refetch, markAsRead, markAllAsRead };
}

export default useNotifications;
