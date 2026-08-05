import { useMemo, useState } from "react";
import { Tabs } from "antd";
import PersonalAttendanceView from "../modules/attendance/components/PersonalAttendanceView";
import TeamAttendanceView from "../modules/attendance/components/TeamAttendanceView";
import AdminAttendanceView from "../modules/attendance/components/AdminAttendanceView";
import LeaveSection from "../modules/leave/components/LeaveSection";
import LiveTrackingMap from "../modules/location/components/LiveTrackingMap";
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
 * - Admin:    Attendance | Leave Requests — admin has no personal
 *   attendance (exempt, §7.4c). Leave is ONE tab: a Status filter covers
 *   what a separate History tab used to, without making you guess which
 *   tab a given request currently lives in.
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
  // §B6 — the live map shows other people's positions, so it's gated on the
  // same `attendance.view_location` grant that already governs seeing
  // coordinates at all. Admin passes via can()'s own admin bypass.
  const canViewLiveMap = can(user, "attendance", "view_location");

  const items = useMemo(() => {
    if (isAdmin) {
      return [
        { key: "attendance", label: "Attendance", children: <AdminAttendanceView /> },
        // §B5 (2026-08-05) — the separate "Leave History" tab is gone. One
        // Leave Requests tab now covers the whole queue, with a Status filter
        // (Pending / Approved / Declined / Unapproved Absence / All) deciding
        // what's shown: pending renders as approval cards, anything decided
        // as the table. Two tabs made you guess which one a request was in.
        { key: "leave-requests", label: "Leave Requests", children: <LeaveSection /> },
        ...(canViewLiveMap ? [{ key: "live-map", label: "Live Map", children: <LiveTrackingMap /> }] : []),
      ];
    }

    if (canViewTeamAttendance) {
      return [
        { key: "my-attendance", label: "My Attendance", children: <PersonalAttendanceView /> },
        { key: "team-attendance", label: "Team Attendance", children: <TeamAttendanceView /> },
        { key: "leave", label: "Leave", children: <LeaveSection view="all" /> },
        ...(canViewLiveMap ? [{ key: "live-map", label: "Live Map", children: <LiveTrackingMap /> }] : []),
      ];
    }

    return [
      { key: "my-attendance", label: "My Attendance", children: <PersonalAttendanceView /> },
      { key: "apply-leave", label: "Apply Leave", children: <ApplyLeavePanel /> },
      { key: "my-leave", label: "My Leave", children: <LeaveSection view="all" /> },
    ];
  }, [isAdmin, canViewTeamAttendance, canViewLiveMap]);

  const [activeKey, setActiveKey] = useState(items[0].key);

  return <Tabs activeKey={activeKey} onChange={setActiveKey} items={items} destroyInactiveTabPane />;
}

export default AttendancePage;
