import { useCallback, useEffect, useState } from "react";
import { listNotificationsByType, markNotificationsReadByType } from "../modules/notification/api/notificationApi";

// Same ~60s cadence the notification bell's own polling uses (§7.26/§7.29).
const POLL_INTERVAL_MS = 60000;

// Which notification types count toward each sidebar badge (§7.29,
// 2026-07-31 — replaces the earlier record-count approach, §7.26, with the
// existing Notification module itself as the single source of truth, no
// parallel tracking system). Exported so `MainLayout.jsx` can pass the exact
// same list to the nav-click mark-as-read call — one place owns "which
// types this badge means," not two lists that could drift apart.
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
export const LEAVE_NOTIFICATION_TYPES = ["leave_requested", "leave_approved", "leave_declined"];

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

    return () => clearInterval(interval);
  }, [refetch]);

  /**
   * Marks every unread notification of this badge's type(s) as read, then
   * immediately reflects that locally (rather than waiting for the next
   * poll tick) — the nav-click behavior §7.29 asks for.
   */
  async function clearLeadsBadge() {
    await markNotificationsReadByType(LEADS_NOTIFICATION_TYPES);
    setNewLeadsCount(0);
  }

  async function clearLeaveBadge() {
    await markNotificationsReadByType(LEAVE_NOTIFICATION_TYPES);
    setPendingLeaveCount(0);
  }

  return { newLeadsCount, pendingLeaveCount, clearLeadsBadge, clearLeaveBadge };
}

export default useSidebarBadgeCounts;
