import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { List } from "antd";
import { usePermission } from "../../../hooks/usePermission";
import useUserDirectory from "../../../hooks/useUserDirectory";
import { listLeave } from "../../leave/api/leaveApi";
import { ROUTE_PATHS } from "../../../constants/routePaths.constants";
import WidgetCard from "./WidgetCard";

/**
 * Count of leave requests awaiting approval. Originally admin-only (§5's
 * matrix: "manager can view but not approve," §7.5), but manager now also
 * holds `leave.approve` by default, scoped to their own team (§7.5c,
 * 2026-07-31) — this widget now shows for a manager too, not just admin.
 *
 * Scope is picked from whichever view-tier grant the caller actually holds
 * (`view_all` → "all", else `view_team` → "team"), the same "check the held
 * grant, don't assume a hierarchy" reasoning `LeaveListPage`'s own scope tabs
 * use — an admin without this, calling `listLeave("all")` as a manager who
 * only holds `view_team` would 403 (a real bug this task's manager-parity
 * change would otherwise have introduced, since `canApprove` alone doesn't
 * imply `view_all`). No scope match (a role with `approve` but neither view
 * tier, which shouldn't happen given the default templates, but not assumed)
 * hides the widget entirely rather than guessing.
 */
function LeavePendingRequestsWidget() {
  const canApprove = usePermission("leave", "approve");
  const canViewAll = usePermission("leave", "view_all");
  const canViewTeam = usePermission("leave", "view_team");
  const scope = canViewAll ? "all" : canViewTeam ? "team" : null;
  const canSeeWidget = canApprove && scope !== null;
  const { users } = useUserDirectory();
  const [pendingLeaves, setPendingLeaves] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!canSeeWidget) {
      return undefined;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    listLeave(scope)
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
  }, [canSeeWidget, scope]);

  if (!canSeeWidget) {
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
      <div className="mb-2 text-sm">
        Pending: <strong>{pendingLeaves.length}</strong>
      </div>
      <List
        size="small"
        dataSource={pendingLeaves.slice(0, 5)}
        renderItem={(leave) => (
          <List.Item>
            <div className="flex flex-col">
              <span>{employeeName(leave.employeeId)}</span>
              {leave.reason && <span className="text-xs text-gray-400">{leave.reason}</span>}
            </div>
          </List.Item>
        )}
      />
      {/* No per-leave detail route exists (unlike Leads/Customers), so this
          links to the Leave list as a whole rather than fabricating one. */}
      <div className="mt-2 text-right text-sm">
        <Link to={ROUTE_PATHS.LEAVE}>View all leave requests →</Link>
      </div>
    </WidgetCard>
  );
}

export default LeavePendingRequestsWidget;
