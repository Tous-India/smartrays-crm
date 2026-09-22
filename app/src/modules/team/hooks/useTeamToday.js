import useServerData from "../../../hooks/useServerData";
import useSessionStore from "../../../store/sessionStore";
import { getLiveLocations, getTeamAttendance, listDirectReports, listTeamLeaves } from "../api/teamApi";
import { getLocationConfig } from "../../tracking/locationApi";
import { monthKey } from "../../attendance/attendance.utils";
import { buildRoster } from "../team.utils";

/**
 * Everything Team Today and the Team Map read, fetched together: the direct
 * reports, this month's team attendance, the team's leave, the live
 * positions, and the server's stale threshold. One request lifecycle
 * (loading / error / refetch) for the whole tab, because the roster is a
 * combination of all of them and a half-loaded roster would be wrong.
 */
function useTeamToday() {
  const managerId = useSessionStore((state) => state.user?._id);

  return useServerData(
    async () => {
      const [reports, attendance, leaves, live, config] = await Promise.all([
        listDirectReports(managerId),
        getTeamAttendance(monthKey()),
        listTeamLeaves(),
        getLiveLocations(),
        getLocationConfig(),
      ]);
      const staleAfterMinutes = Number(config.data.data.staleAfterMinutes) || 10;
      // GET /users includes the caller themselves in a manager's scope; the
      // managerId filter already narrows to the reports, but never list me.
      const people = reports.data.data.filter((person) => String(person._id) !== String(managerId));

      return {
        reports: people,
        records: attendance.data.data,
        leaves: leaves.data.data,
        live: live.data.data,
        staleAfterMinutes,
        roster: buildRoster({ reports: people, records: attendance.data.data, leaves: leaves.data.data, live: live.data.data, staleAfterMinutes }),
      };
    },
    { deps: [managerId] }
  );
}

export default useTeamToday;
