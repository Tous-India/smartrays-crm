import { useMemo, useState } from "react";
import { Tabs } from "antd";
import PersonalAttendanceView from "../modules/attendance/components/PersonalAttendanceView";
import TeamAttendanceView from "../modules/attendance/components/TeamAttendanceView";
import AdminAttendanceView from "../modules/attendance/components/AdminAttendanceView";
import LeaveSection from "../modules/leave/components/LeaveSection";
import LiveTrackingMap from "../modules/location/components/LiveTrackingMap";
import LocationConsentPanel from "../modules/location/components/LocationConsentPanel";
import LocationHistoryMap from "../modules/location/components/LocationHistoryMap";
import MonthlyReportSection from "../modules/attendance/components/MonthlyReportSection";
import useSessionStore from "../store/sessionStore";
import { can } from "../utils/permission.utils";
import canViewLocationMaps from "../modules/location/locationAccess";

/**
 * `/attendance` — the single home for attendance AND leave (§B, 2026-08-05).
 * The standalone `/leave` route is gone; everything it did now lives in a tab
 * here, because the two were always the same question ("was this person at
 * work, and if not why") split across two pages.
 *
 * **Tabs are role-shaped, not permission-derived**, matching how each role
 * actually uses the page:
 * - Employee: attendance only — their leave lives at `/leave` (§7.39), so
 *   a single tab renders with no tab bar.
 * - Manager:  My Attendance | Team Attendance | Leave — their existing
 *   Own/Team split stays INSIDE the Leave tab as a sub-filter rather than
 *   becoming two more top-level tabs, so the top level stays about "whose
 *   attendance" and the sub-filter about "whose leave".
 * - Admin:    Attendance | Leave Requests | Live Map | Report — admin has no
 *   personal attendance (exempt, §7.4c). Leave is ONE tab: a Status filter
 *   covers what a separate History tab used to, without making you guess
 *   which tab a given request currently lives in. Report (§7.47) is the
 *   monthly salary summary, gated separately on `payroll.run`.
 *
 * **This is a UI move, not a permission change.** Managers keep exactly the
 * approve / decline / mark-unapproved-absence / delete parity built in
 * §7.5c/§7.5d; every gate still comes from the same `leave.*` grants, and
 * the backend is untouched.
 */
/** The Live Map tab: the map, then the consent panel (§7.73) beneath it. */
function LiveMapTab() {
  return (
    <div className="flex flex-col gap-4">
      <LiveTrackingMap />
      <LocationConsentPanel />
    </div>
  );
}

function AttendancePage() {
  const user = useSessionStore((state) => state.user);
  const isAdmin = user?.role === "admin";
  const canViewTeamAttendance = can(user, "attendance", "view_team");
  // §7.67 — ONE gate, matching the API. This was `attendance.view_location`,
  // which disagreed with the `location.*` gate the routes actually enforce and
  // hid the tab from default managers the API would have served.
  const canViewLiveMap = canViewLocationMaps(user);
  // §7.47 — mirrors the route's own gate exactly. Hiding the tab is the
  // courtesy; the 403 on GET /payroll/monthly-report is the guarantee.
  const canViewMonthlyReport = can(user, "payroll", "run");

  const items = useMemo(() => {
    if (isAdmin) {
      return [
        { key: "attendance", label: "Attendance", children: <AdminAttendanceView /> },
        // §B5 (2026-08-05) — the separate "Leave History" tab is gone. One
        // Leave Requests tab now covers the whole queue, with a Status filter
        // (Pending / Approved / Declined / Unapproved Absence / All) deciding
        // what's shown: pending renders as approval cards, anything decided
        // as the table. Two tabs made you guess which one a request was in.
        // §7.4g (2026-08-09) — pending approval CARDS moved to the Attendance
        // tab, where the roster they affect lives. This tab keeps its status
        // filter, stat cards and history table; `hidePendingCards` stops the
        // cards appearing in both places.
        { key: "leave-requests", label: "Leave Requests", children: <LeaveSection hidePendingCards /> },
        ...(canViewLiveMap
          ? [
              // §7.73 — who has agreed to tracking sits under the map it governs.
              { key: "live-map", label: "Live Map", children: <LiveMapTab /> },
              // §7.67 — same gate as Live Map, matching the API.
              { key: "location-history", label: "Location History", children: <LocationHistoryMap /> },
            ]
          : []),
        // §7.47 (2026-08-11) — the monthly leave-and-attendance report, last
        // because it summarises what the earlier tabs record. Gated on
        // `payroll.run`, the existing "see everyone's payroll" grant: this
        // shows every employee's base salary, and `payroll.view` would have
        // been wrong — it means "own payslip only" and sits in the default
        // employee template.
        ...(canViewMonthlyReport
          ? [{ key: "report", label: "Report", children: <MonthlyReportSection /> }]
          : []),
      ];
    }

    if (canViewTeamAttendance) {
      return [
        { key: "my-attendance", label: "My Attendance", children: <PersonalAttendanceView /> },
        { key: "team-attendance", label: "Team Attendance", children: <TeamAttendanceView /> },
        { key: "leave", label: "Leave", children: <LeaveSection view="all" /> },
        ...(canViewLiveMap
          ? [
              { key: "live-map", label: "Live Map", children: <LiveMapTab /> },
              // §7.67 — same gate as Live Map, matching the API.
              { key: "location-history", label: "Location History", children: <LocationHistoryMap /> },
            ]
          : []),
      ];
    }

    // §7.39 (2026-08-05) — an employee's Attendance page is attendance ONLY.
    // Apply Leave and My Leave moved to their own `/leave` route, so this
    // role has one tab and therefore no tab bar at all. Admin and manager
    // keep the combined tabbed page above, unchanged.
    return [{ key: "my-attendance", label: "My Attendance", children: <PersonalAttendanceView /> }];
  }, [isAdmin, canViewTeamAttendance, canViewLiveMap, canViewMonthlyReport]);

  // ?tab=live-map (2026-10-23) — the dashboard's "Open live map" lands on that
  // tab; an unknown or unavailable key falls back to the first tab.
  const [activeKey, setActiveKey] = useState(() => {
    const requested = new URLSearchParams(window.location.search).get("tab");
    return items.some((item) => item.key === requested) ? requested : items[0].key;
  });

  return <Tabs activeKey={activeKey} onChange={setActiveKey} items={items} destroyOnHidden />;
}

export default AttendancePage;
