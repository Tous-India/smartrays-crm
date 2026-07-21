import { Result } from "antd";
import TeamAttendanceView from "../modules/attendance/components/TeamAttendanceView";
import useSessionStore from "../store/sessionStore";
import { can } from "../utils/permission.utils";

/**
 * `/attendance/team` — manager/admin only, per §7.4's `view_team`/`view_all`
 * grants. `PermissionGate` only expresses a single module+action pair, so
 * this "either of two actions" check is done inline with `can()` directly —
 * the same OR pattern `MainLayout`'s own nav already uses for Tickets
 * (`view_assigned` OR `view_all`).
 */
function AttendanceTeamPage() {
  const user = useSessionStore((state) => state.user);
  const canViewTeam = can(user, "attendance", "view_team") || can(user, "attendance", "view_all");

  if (!canViewTeam) {
    return (
      <Result
        status="403"
        title="Not authorized"
        subTitle="You do not have permission to view team attendance."
      />
    );
  }

  return <TeamAttendanceView />;
}

export default AttendanceTeamPage;
