import { useCallback, useEffect, useState } from "react";
import { getLeadCount } from "../modules/lead/api/leadApi";
import { getPendingLeaveCount } from "../modules/leave/api/leaveApi";

// Same ~60s cadence the notification bell's own polling uses as a reference
// point (§7.26) — a sidebar badge is lower-urgency than a notification, so
// there's no reason to poll more often than that.
const POLL_INTERVAL_MS = 60000;

/**
 * Backs the Leads/Leave sidebar count badges (`MainLayout.jsx`, §7.26) — a
 * lightweight `GET .../count` poll for each, not the full list. Both counts
 * are fetched independently and a failure on one never blocks the other
 * (each call is caught on its own) — a transient error just leaves that
 * one badge showing its last-known value until the next tick, rather than
 * throwing and breaking the whole sidebar.
 *
 * `canViewLeads`/`isAdmin` gate which counts are even fetched — the Leave
 * pending count is admin-only server-side (`requireAdmin`, not a
 * permission grant), so a non-admin never triggers that request at all,
 * not just hides the resulting badge.
 */
export function useSidebarBadgeCounts({ canViewLeads, isAdmin }) {
  const [newLeadsCount, setNewLeadsCount] = useState(0);
  const [pendingLeaveCount, setPendingLeaveCount] = useState(0);

  const refetch = useCallback(async () => {
    if (canViewLeads) {
      try {
        const response = await getLeadCount({ status: "new" });
        setNewLeadsCount(response.data.data.count);
      } catch {
        // Leave the last-known count in place until the next tick.
      }
    }

    if (isAdmin) {
      try {
        const response = await getPendingLeaveCount();
        setPendingLeaveCount(response.data.data.count);
      } catch {
        // Leave the last-known count in place until the next tick.
      }
    }
  }, [canViewLeads, isAdmin]);

  useEffect(() => {
    refetch();
    const interval = setInterval(refetch, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [refetch]);

  return { newLeadsCount, pendingLeaveCount };
}

export default useSidebarBadgeCounts;
