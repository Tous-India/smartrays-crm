import PersonalAttendanceView from "../modules/attendance/components/PersonalAttendanceView";
import AdminAttendanceView from "../modules/attendance/components/AdminAttendanceView";
import useSessionStore from "../store/sessionStore";

/**
 * `/attendance` — redefined for admin (2026-07-31, §7.4 reversal): admin has
 * no personal attendance data at all (exempt from checking in, §7.4c), so
 * `PersonalAttendanceView` always rendered an empty table for this role.
 * Admin now gets `AdminAttendanceView` (org-wide, filterable) instead;
 * Manager/Employee/Sales Associate keep the existing `PersonalAttendanceView`
 * unchanged.
 */
function AttendancePage() {
  const user = useSessionStore((state) => state.user);
  const isAdmin = user?.role === "admin";

  return isAdmin ? <AdminAttendanceView /> : <PersonalAttendanceView />;
}

export default AttendancePage;
