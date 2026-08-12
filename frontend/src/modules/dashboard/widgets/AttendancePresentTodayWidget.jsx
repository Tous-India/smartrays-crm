import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Statistic } from "antd";
import { usePermission } from "../../../hooks/usePermission";
import { getTeamAttendance } from "../../attendance/api/attendanceApi";
import { ROUTE_PATHS } from "../../../constants/routePaths.constants";
import WidgetCard from "./WidgetCard";

const PRESENT_STATUSES = ["present", "half_day"];

/**
 * Count of employees present (`present`/`half_day`) today — a manager/admin
 * glance metric, not shown to employee/sales_associate. Reuses
 * `getTeamAttendance(month)`, the exact same scoped fetch
 * `TeamAttendanceView` already calls (team for a manager, org-wide for
 * admin, enforced server-side in `attendance.service.js`). `GET
 * /attendance/team` has no "just today" filter, only a `month`, so this
 * fetches the current month and filters client-side to today's date — the
 * same precedent `TeamAttendanceView`'s own employee selector and
 * `LeadsHotWidget`'s `isHot` filter already set for a filter the backend
 * doesn't expose.
 */
function AttendancePresentTodayWidget() {
  const canViewTeam = usePermission("attendance", "view_team");
  const canViewAll = usePermission("attendance", "view_all");
  const canView = canViewTeam || canViewAll;
  const [presentCount, setPresentCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!canView) {
      return undefined;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const todayKey = now.toDateString();

    getTeamAttendance(month)
      .then((response) => {
        if (cancelled) {
          return;
        }
        const todaysRecords = response.data.data.filter(
          (record) => new Date(record.date).toDateString() === todayKey
        );
        setPresentCount(todaysRecords.filter((record) => PRESENT_STATUSES.includes(record.status)).length);
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
  }, [canView]);

  if (!canView) {
    return null;
  }

  return (
    <WidgetCard title="Present Today" isLoading={isLoading} error={error} isEmpty={false}>
      <Statistic
        title={<span className="text-xs text-gray-500">Employees present/half-day today</span>}
        value={presentCount}
        valueStyle={{ fontSize: 20 }}
      />
      <div className="mt-2 text-left text-sm">
        <Link to={ROUTE_PATHS.ATTENDANCE_TEAM}>View team attendance →</Link>
      </div>
    </WidgetCard>
  );
}

export default AttendancePresentTodayWidget;
