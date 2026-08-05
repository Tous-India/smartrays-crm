import { useMemo, useState } from "react";
import { Segmented, Space } from "antd";
import PersonalAttendanceView from "../modules/attendance/components/PersonalAttendanceView";
import TeamAttendanceView from "../modules/attendance/components/TeamAttendanceView";
import AdminAttendanceView from "../modules/attendance/components/AdminAttendanceView";
import useSessionStore from "../store/sessionStore";
import { can } from "../utils/permission.utils";

/**
 * `/attendance` — redefined for admin (2026-07-31, §7.4 reversal): admin has
 * no personal attendance data at all (exempt from checking in, §7.4c), so
 * `PersonalAttendanceView` always rendered an empty table for this role.
 * Admin gets `AdminAttendanceView` (org-wide, filterable) instead.
 *
 * **Own/Team tabs for everyone else (2026-08-05)** — a manager holds
 * `attendance.view_team` by default, but this page only ever rendered
 * `PersonalAttendanceView`, so `TeamAttendanceView` was unreachable in the
 * UI: the component existed and its endpoint worked, nothing routed to it.
 * Tabs are built exactly the way `LeaveListPage` already builds its own
 * (§7.5e) — derived from the grants actually held, and hidden entirely when
 * there's only one real choice, rather than showing a lone toggle. So a
 * manager sees "Own"/"Team"; a plain employee still sees just their own
 * list with no tab UI at all, unchanged.
 */
function AttendancePage() {
  const user = useSessionStore((state) => state.user);
  const isAdmin = user?.role === "admin";

  // "Own" needs no grant — viewing your own attendance is self-service, the
  // same reasoning `GET /attendance/me` itself applies (no permission gate).
  const scopeOptions = useMemo(
    () =>
      [
        { value: "own", label: "Own" },
        can(user, "attendance", "view_team") && { value: "team", label: "Team" },
      ].filter(Boolean),
    [user]
  );

  const [scope, setScope] = useState("own");
  const showScopeTabs = scopeOptions.length > 1;

  if (isAdmin) {
    return <AdminAttendanceView />;
  }

  return (
    <div className="flex flex-col gap-4">
      {showScopeTabs && (
        <Space wrap>
          <Segmented options={scopeOptions} value={scope} onChange={setScope} />
        </Space>
      )}

      {scope === "team" && showScopeTabs ? <TeamAttendanceView /> : <PersonalAttendanceView />}
    </div>
  );
}

export default AttendancePage;
