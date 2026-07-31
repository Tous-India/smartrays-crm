import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import dayjs from "dayjs";
import useSessionStore from "../../../store/sessionStore";
import { getMyAttendance, getTeamAttendance } from "../../attendance/api/attendanceApi";
import AttendanceSummaryStats from "../../attendance/components/AttendanceSummaryStats";
import { ROUTE_PATHS } from "../../../constants/routePaths.constants";
import WidgetCard from "../../dashboard/widgets/WidgetCard";

// Two forms of "this month," each needed by a different consumer below:
// `AttendanceSummaryStats` needs the real dayjs object (`.daysInMonth()`
// etc.); the API calls need the `"YYYY-MM"` string `useMyAttendance`'s own
// callers (e.g. `CheckInOutWidget`) already send — a raw dayjs object sent
// as an axios query param serializes to its full ISO string instead, which
// the backend's month parser rejects (a real 400 found live-testing this
// card, not a hypothetical).
const CURRENT_MONTH = dayjs();
const CURRENT_MONTH_STRING = CURRENT_MONTH.format("YYYY-MM");

/**
 * This month's present/absent/half-day/on-leave counts for one employee —
 * reuses `AttendanceSummaryStats`'s own client-side computation over
 * already-fetched records verbatim (no second summary calculation). Which
 * endpoint gets called depends on whose page this is: viewing your OWN
 * detail page reuses `GET /attendance/me` (`useMyAttendance`'s own
 * endpoint), since that's always allowed regardless of any attendance.*
 * grant; viewing someone else's reuses `GET /attendance/team` — which has
 * no `employeeId` filter of its own (see `useTeamAttendance`'s own
 * comment) — filtered client-side to this one employee, the exact same
 * "fetch the team, filter to one person" approach `TeamAttendanceView`'s
 * own employee selector already uses.
 */
function UserAttendanceSummaryCard({ user }) {
  const currentUser = useSessionStore((state) => state.user);
  const isSelf = currentUser?._id === user._id;
  const [records, setRecords] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const fetchRecords = isSelf ? getMyAttendance(CURRENT_MONTH_STRING) : getTeamAttendance(CURRENT_MONTH_STRING);

    fetchRecords
      .then((response) => {
        if (cancelled) {
          return;
        }
        const allRecords = response.data.data;
        setRecords(isSelf ? allRecords : allRecords.filter((record) => record.employeeId === user._id));
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
  }, [isSelf, user._id]);

  return (
    <WidgetCard title="Attendance Summary (This Month)" isLoading={isLoading} error={error} isEmpty={false}>
      <AttendanceSummaryStats records={records} month={CURRENT_MONTH} />
      <div className="mt-2 text-right text-sm">
        <Link to={isSelf ? ROUTE_PATHS.ATTENDANCE : ROUTE_PATHS.ATTENDANCE_TEAM}>View attendance →</Link>
      </div>
    </WidgetCard>
  );
}

export default UserAttendanceSummaryCard;
