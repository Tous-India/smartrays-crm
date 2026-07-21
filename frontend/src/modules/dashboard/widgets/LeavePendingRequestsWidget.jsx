import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { List } from "antd";
import { usePermission } from "../../../hooks/usePermission";
import useUserDirectory from "../../../hooks/useUserDirectory";
import { listLeave } from "../../leave/api/leaveApi";
import { ROUTE_PATHS } from "../../../constants/routePaths.constants";
import WidgetCard from "./WidgetCard";

/**
 * Count of leave requests awaiting approval, admin-only — §5's matrix: only
 * admin ever approves leave ("manager can view but not approve," §7.5), so
 * this widget is meaningful to admin alone, unlike every scoped Leads/
 * Customers/Attendance widget above. There's no `leave.approve` action in
 * `PERMISSION_REGISTRY` (approval is a structural `requireAdmin` route
 * check, not a per-user grant, mirroring `leave.routes.js`) — `usePermission`
 * still gates this correctly: the frontend `can()` helper's admin bypass
 * returns true regardless of the module/action pair, and no non-admin's
 * `permissions` object can ever contain an `approve` key that isn't in the
 * registry, so this reads as "admin only" exactly as intended.
 *
 * Reuses `listLeave("all")`, the same call `LeaveListPage`'s "all" scope tab
 * already makes, filtering to `status === "pending"` client-side (no
 * server-side status filter exists on this endpoint).
 */
function LeavePendingRequestsWidget() {
  const canApprove = usePermission("leave", "approve");
  const { users } = useUserDirectory();
  const [pendingLeaves, setPendingLeaves] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!canApprove) {
      return undefined;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    listLeave("all")
      .then((response) => {
        if (!cancelled) {
          setPendingLeaves(response.data.data.filter((leave) => leave.status === "pending"));
        }
      })
      .catch((fetchError) => {
        if (!cancelled) {
          setError(fetchError);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [canApprove]);

  if (!canApprove) {
    return null;
  }

  function employeeName(employeeId) {
    return users.find((user) => user._id === employeeId)?.name || "Unknown employee";
  }

  return (
    <WidgetCard
      title="Pending Leave Requests"
      isLoading={isLoading}
      error={error}
      isEmpty={!isLoading && !error && pendingLeaves.length === 0}
      emptyDescription="No pending leave requests"
    >
      <div className="mb-3">
        Pending: <strong>{pendingLeaves.length}</strong>
      </div>
      <List size="small" dataSource={pendingLeaves.slice(0, 5)} renderItem={(leave) => <List.Item>{employeeName(leave.employeeId)}</List.Item>} />
      {/* No per-leave detail route exists (unlike Leads/Customers), so this
          links to the Leave list as a whole rather than fabricating one. */}
      <div className="mt-3 text-right">
        <Link to={ROUTE_PATHS.LEAVE}>View all leave requests →</Link>
      </div>
    </WidgetCard>
  );
}

export default LeavePendingRequestsWidget;
