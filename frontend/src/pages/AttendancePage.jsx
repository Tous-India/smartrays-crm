import { useMemo, useState } from "react";
import { Tabs } from "antd";
import PersonalAttendanceView from "../modules/attendance/components/PersonalAttendanceView";
import TeamAttendanceView from "../modules/attendance/components/TeamAttendanceView";
import AdminAttendanceView from "../modules/attendance/components/AdminAttendanceView";
import LeaveSection from "../modules/leave/components/LeaveSection";
import ApplyLeavePanel from "../modules/leave/components/ApplyLeavePanel";
import useSessionStore from "../store/sessionStore";
import { can } from "../utils/permission.utils";

/**
 * `/attendance` — the single home for attendance AND leave (§B, 2026-08-05).
 * The standalone `/leave` route is gone; everything it did now lives in a tab
 * here, because the two were always the same question ("was this person at
 * work, and if not why") split across two pages.
 *
 * **Tabs are role-shaped, not permission-derived**, matching how each role
 * actually uses the page:
 * - Employee: My Attendance | Apply Leave | My Leave
 * - Manager:  My Attendance | Team Attendance | Leave — their existing
 *   Own/Team split stays INSIDE the Leave tab as a sub-filter rather than
 *   becoming two more top-level tabs, so the top level stays about "whose
 *   attendance" and the sub-filter about "whose leave".
 * - Admin:    Attendance | Leave Requests | Leave History — admin has no
 *   personal attendance (exempt, §7.4c) and their leave work splits cleanly
 *   into "decide these" and "look back at those".
 *
 * **This is a UI move, not a permission change.** Managers keep exactly the
 * approve / decline / mark-unapproved-absence / delete parity built in
 * §7.5c/§7.5d; every gate still comes from the same `leave.*` grants, and
 * the backend is untouched.
 */
function AttendancePage() {
  const user = useSessionStore((state) => state.user);
  const isAdmin = user?.role === "admin";
  const canViewTeamAttendance = can(user, "attendance", "view_team");

  const items = useMemo(() => {
    if (isAdmin) {
      return [
        { key: "attendance", label: "Attendance", children: <AdminAttendanceView /> },
        { key: "leave-requests", label: "Leave Requests", children: <LeaveSection view="pending" /> },
        { key: "leave-history", label: "Leave History", children: <LeaveSection view="history" /> },
      ];
    }

    if (canViewTeamAttendance) {
      return [
        { key: "my-attendance", label: "My Attendance", children: <PersonalAttendanceView /> },
        { key: "team-attendance", label: "Team Attendance", children: <TeamAttendanceView /> },
        { key: "leave", label: "Leave", children: <LeaveSection view="all" /> },
      ];
    }

    return [
      { key: "my-attendance", label: "My Attendance", children: <PersonalAttendanceView /> },
      { key: "apply-leave", label: "Apply Leave", children: <ApplyLeavePanel /> },
      { key: "my-leave", label: "My Leave", children: <LeaveSection view="all" /> },
    ];
  }, [isAdmin, canViewTeamAttendance]);

  const [activeKey, setActiveKey] = useState(items[0].key);

  return <Tabs activeKey={activeKey} onChange={setActiveKey} items={items} destroyInactiveTabPane />;
}

export default AttendancePage;
