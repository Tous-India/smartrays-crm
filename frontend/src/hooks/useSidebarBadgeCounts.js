import { useCallback, useEffect, useState } from "react";
import { listNotificationsByType } from "../modules/notification/api/notificationApi";
import { NOTIFICATIONS_CHANGED_EVENT } from "../modules/notification/notificationEvents";

// Same ~60s cadence the notification bell's own polling uses (§7.26/§7.29).
const POLL_INTERVAL_MS = 60000;

// Which notification types count toward each sidebar badge (§7.29,
// 2026-07-31 — replaces the earlier record-count approach, §7.26, with the
// existing Notification module itself as the single source of truth, no
// parallel tracking system). Exported so `MainLayout.jsx` can pass the exact
// same list to the badge count — one place owns "which types this badge
// means," not two lists that could drift apart.
//
// Leads: both `lead_created` (the admin/owner broadcast added this task) and
// `lead_assigned` (the pre-existing personal "you were assigned this" ping)
// count — either one means "there's a lead you haven't looked at yet."
export const LEADS_NOTIFICATION_TYPES = ["lead_created", "lead_assigned"];
// Leave: all three existing Leave notification types. Unlike the old
// admin-only pending-count badge, this is naturally self-scoped by the
// Notification module itself — `leave_requested` only ever goes to admins
// (a request to review), `leave_approved`/`leave_declined` only ever go to
// the employee whose request was decided — so the same badge is
// meaningfully non-zero for an admin (pending requests) OR an employee
// (their own outcome), with no separate role gate needed.
// `leave_unapproved_absence` added 2026-08-06 (§7.43) alongside the backend
// type. If this list and the enum drift, the bell shows a notification the
// sidebar badge never counts — the two would visibly disagree.
export const LEAVE_NOTIFICATION_TYPES = [
  "leave_requested",
  "leave_approved",
  "leave_declined",
  "leave_unapproved_absence",
];

/**
 * Backs the Leads/Leave sidebar count badges (`MainLayout.jsx`) — each is
 * just the caller's own unread-notification count, filtered by type, via
 * the same `GET /notifications` the bell dropdown already uses (no
 * dedicated count endpoint). Both counts are fetched independently and a
 * failure on one never blocks the other (each call is caught on its own) —
 * a transient error just leaves that one badge showing its last-known value
 * until the next tick, rather than throwing and breaking the whole sidebar.
 *
 * `canViewLeads` gates whether the Leads count is even fetched, matching
 * the Leads nav item's own visibility — there's no equivalent gate for
 * Leave since that nav item (and hence this badge) is already shown to
 * everyone.
 */
export function useSidebarBadgeCounts({ canViewLeads }) {
  const [newLeadsCount, setNewLeadsCount] = useState(0);
  const [pendingLeaveCount, setPendingLeaveCount] = useState(0);

  const refetch = useCallback(async () => {
    if (canViewLeads) {
      try {
        const response = await listNotificationsByType(LEADS_NOTIFICATION_TYPES, { unreadOnly: true });
        setNewLeadsCount(response.data.data.length);
      } catch {
        // Leave the last-known count in place until the next tick.
      }
    }

    try {
      const response = await listNotificationsByType(LEAVE_NOTIFICATION_TYPES, { unreadOnly: true });
      setPendingLeaveCount(response.data.data.length);
    } catch {
      // Leave the last-known count in place until the next tick.
    }
  }, [canViewLeads]);

  useEffect(() => {
    refetch();
    const interval = setInterval(refetch, POLL_INTERVAL_MS);

    /**
     * Refetch on tab return (§7.43, 2026-08-06) — the same fix
     * `useNotifications` and `useCheckedInHeartbeatLoop` already carry.
     * Browsers throttle a backgrounded tab's timers, so without this the
     * sidebar badge sat stale while the bell (which had the listener) updated
     * on return, and the two visibly disagreed about how much was unread.
     */
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        refetch();
      }
    }

    /**
     * Refetch when the user actually dismisses something in the bell
     * (§7.43). The bell and this hook are two independent readers of the same
     * data with no shared store; without this, marking a notification read in
     * the dropdown left the sidebar badge showing the old count for up to a
     * full poll interval. A window event rather than lifted state keeps the
     * two hooks decoupled — neither imports the other.
     */
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, refetch);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearInterval(interval);
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, refetch);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refetch]);

  /*
   * `clearLeadsBadge`/`clearLeaveBadge` are GONE (§7.43, 2026-08-06).
   *
   * They were wired to the Leads and Attendance nav items' `onNavigate` and
   * called `markAllRead` for every type in the badge — so clicking
   * "Attendance" for any reason at all marked every unread leave notification
   * read, whether or not it had ever been displayed. An admin who opened
   * Attendance to look at attendance silently destroyed their own pending-
   * leave badge, which is exactly the "admin never receives leave
   * notifications" report: the record was created and delivered correctly,
   * then dismissed by a navigation.
   *
   * Dismissal is now only ever explicit — opening the notification from the
   * bell, or its "Mark all as read" button.
   */

  return { newLeadsCount, pendingLeaveCount };
}

export default useSidebarBadgeCounts;
