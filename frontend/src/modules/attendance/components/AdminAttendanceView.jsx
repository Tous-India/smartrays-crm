import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { DatePicker, Select, App } from "antd";
import AttendanceRecordsSection from "./AttendanceRecordsSection";
import ReportDownloadButton from "../../../components/ReportDownloadButton";
import { getTeamAttendance, markAttendanceStatus } from "../api/attendanceApi";
import { listUsers } from "../../user/api/userApi";
import useTeams from "../../team/hooks/useTeams";
import useUserDirectory from "../../../hooks/useUserDirectory";
import { ATTENDANCE_LIFECYCLE_FILTER_OPTIONS, deriveAttendanceLifecycleState } from "../constants/attendance.constants";
import findMissingAttendanceDays from "../utils/missingAttendanceDays";
import {
  DATE_RANGE_OPTIONS,
  DATE_RANGE_PRESETS,
  resolveDateRange,
  monthKeysInRange,
  isWithinRange,
  toLocalDateKey,
} from "../../../utils/date.utils";

const { RangePicker } = DatePicker;

/**
 * `/attendance` for admin (2026-07-31, §7.4 reversal) — admin has no
 * personal attendance data at all (exempt from checking in, §7.4c), so the
 * old `PersonalAttendanceView` always rendered an empty table for this role.
 * Redefines what admin sees on this route: every employee's attendance,
 * org-wide, reusing `GET /attendance/team` — which already resolves to
 * every record for a caller holding `attendance.view_all` (admin's default
 * bypass), the exact same "route confirms a grant, the service resolves the
 * actual scope" split `TeamAttendanceView` itself already relies on for a
 * manager's narrower `view_team`. Manager and Employee are completely
 * unaffected — `AttendancePage.jsx` only routes here for `role === "admin"`.
 *
 * Filters (§B7/§B8, 2026-08-05): a single Date Range preset dropdown
 * (Today / Yesterday / This Month / Custom — start/end inputs appear only
 * under Custom; month-wise filtering is gone), plus Employee, Team and
 * Status. All four and the report button sit on ONE row, with the stat
 * cards above them.
 *
 * `GET /attendance/team` accepts only `month=`, never a range, so an
 * arbitrary span fetches every calendar month it touches (almost always 1)
 * and narrows to the exact days client-side — see `utils/date.utils.js`. The Team filter needs each employee's `managerId`, which the
 * lightweight `useUserDirectory()` dropdown doesn't return — a full roster
 * fetch (`GET /users`) is made instead, matching the same reasoning the
 * Leave module's own Admin Team filter (§7.5c) already established, and
 * built against the real `Team` entity (`useTeams()`) rather than a
 * manager-list stand-in, to avoid that same filter's now-fixed bug (§7.5d).
 */
function AdminAttendanceView() {
  const { message } = App.useApp();
  // §B8 (2026-08-05) — one preset dropdown replaces the old month picker
  // AND the separate start/end range pickers. Month-wise filtering is gone
  // entirely; "This Month" covers the only case it served.
  const [datePreset, setDatePreset] = useState(DATE_RANGE_PRESETS.today);
  const [customRange, setCustomRange] = useState(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const [records, setRecords] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  // Bumped after a successful mark-status write so the month re-fetches and
  // the newly-created record replaces its synthetic missing-day row.
  const [refreshToken, setRefreshToken] = useState(0);

  const { users } = useUserDirectory();
  const { teams } = useTeams();
  const [fullDirectory, setFullDirectory] = useState([]);

  useEffect(() => {
    let cancelled = false;

    listUsers({})
      .then((response) => {
        if (!cancelled) {
          setFullDirectory(response.data.data);
        }
      })
      .catch(() => {
        // Team filter degrades to "All teams" only — not worth failing the
        // whole page over a filter option list.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const managerIdByEmployeeId = useMemo(
    () => new Map(fullDirectory.map((directoryUser) => [String(directoryUser._id), directoryUser.managerId ? String(directoryUser.managerId) : null])),
    [fullDirectory]
  );

  const range = useMemo(() => resolveDateRange(datePreset, customRange), [datePreset, customRange]);
  // Stable primitive deps — a new dayjs object every render would re-fire
  // the fetch effect endlessly.
  const fromKey = range ? toLocalDateKey(range.from) : null;
  const toKey = range ? toLocalDateKey(range.to) : null;

  useEffect(() => {
    // A Custom preset with no range picked yet resolves to null — skip the
    // fetch rather than guessing a default span.
    if (!range) {
      setRecords([]);
      setIsLoading(false);
      return undefined;
    }

    let cancelled = false;
    setIsLoading(true);

    // The list endpoints take only `?month=` (see `date.utils.js`), so an
    // arbitrary range fetches each month it touches and narrows locally.
    Promise.all(monthKeysInRange(range.from, range.to).map((key) => getTeamAttendance(key)))
      .then((responses) => {
        if (cancelled) {
          return;
        }

        const merged = responses.flatMap((response) => response.data.data);
        setRecords(merged.filter((record) => isWithinRange(record.date, range.from, range.to)));
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromKey, toKey, refreshToken]);

  const employeeNameById = useMemo(() => new Map(users.map((user) => [user._id, user.name])), [users]);

  // Team/Department column (2026-08-05) — derived from the same two sources
  // the Team FILTER above already relies on (`useTeams()` + the full roster's
  // `managerId`), so the column and the filter can never disagree about which
  // team someone is in. No extra fetch.
  const teamNameByEmployeeId = useMemo(() => {
    const teamNameByHeadId = new Map(teams.map((team) => [String(team.headManagerId), team.name]));

    return new Map(
      fullDirectory.map((directoryUser) => [
        String(directoryUser._id),
        teamNameByHeadId.get(String(directoryUser.managerId)) || null,
      ])
    );
  }, [teams, fullDirectory]);

  const employeeOptions = useMemo(() => {
    const uniqueEmployeeIds = [...new Set(records.map((record) => String(record.employeeId)))];

    return [
      { value: "", label: "All employees" },
      ...uniqueEmployeeIds.map((employeeId) => ({
        value: employeeId,
        label: employeeNameById.get(employeeId) || employeeId,
      })),
    ];
  }, [records, employeeNameById]);

  const teamOptions = useMemo(
    () => [{ value: "", label: "All teams" }, ...teams.map((team) => ({ value: team._id, label: team.name }))],
    [teams]
  );

  const filteredRecords = records
    .filter((record) => !selectedEmployeeId || String(record.employeeId) === selectedEmployeeId)
    .filter((record) => !selectedStatus || deriveAttendanceLifecycleState(record) === selectedStatus)
    .filter((record) => {
      if (!selectedTeamId) {
        return true;
      }

      const team = teams.find((candidate) => candidate._id === selectedTeamId);
      return team && managerIdByEmployeeId.get(String(record.employeeId)) === String(team.headManagerId);
    });

  const rangeStart = range?.from ?? dayjs().startOf("day");
  const rangeEnd = range?.to ?? dayjs().endOf("day");
  const from = toLocalDateKey(rangeStart);
  const to = toLocalDateKey(rangeEnd);

  // Gap-filling rows (2026-08-05) — only ever generated for ONE employee at
  // a time; see `utils/missingAttendanceDays.js` for why. `records` (not
  // `filteredRecords`) is the source so a Status filter can't make a day
  // that DOES have a record look like a gap.
  const missingDays = useMemo(
    () =>
      findMissingAttendanceDays({
        records,
        employeeId: selectedEmployeeId,
        from: rangeStart,
        to: rangeEnd,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [records, selectedEmployeeId, from, to]
  );

  async function handleMarkStatus(row, status) {
    try {
      await markAttendanceStatus({ employeeId: row.employeeId, date: dayjs(row.date).format("YYYY-MM-DD"), status });
      message.success(status === "absent" ? "Marked as Absent" : "Marked as Half Day");
      setRefreshToken((previous) => previous + 1);
    } catch (error) {
      message.error(error.response?.data?.message || "Could not mark this day — please try again.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* §B7 — filters and actions on ONE row; the stat cards now render
          above this, inside AttendanceRecordsSection. */}
      <div className="flex flex-wrap items-center gap-3">
        <Select
          aria-label="Date range"
          value={datePreset}
          options={DATE_RANGE_OPTIONS}
          style={{ width: 150 }}
          onChange={(value) => {
            setDatePreset(value);
            if (value !== DATE_RANGE_PRESETS.custom) {
              setCustomRange(null);
            }
          }}
        />
        {/* Start/end inputs exist ONLY under Custom (§B8). */}
        {datePreset === DATE_RANGE_PRESETS.custom && (
          <RangePicker value={customRange} onChange={setCustomRange} allowClear />
        )}
        <Select
          aria-label="Employee"
          value={selectedEmployeeId}
          options={employeeOptions}
          style={{ width: 220 }}
          showSearch
          optionFilterProp="label"
          onChange={setSelectedEmployeeId}
        />
        <Select
          aria-label="Team"
          value={selectedTeamId}
          options={teamOptions}
          style={{ width: 200 }}
          showSearch
          optionFilterProp="label"
          onChange={setSelectedTeamId}
        />
        <Select
          aria-label="Status"
          value={selectedStatus}
          options={ATTENDANCE_LIFECYCLE_FILTER_OPTIONS}
          style={{ width: 160 }}
          onChange={setSelectedStatus}
        />
        <div className="ms-auto">
          <ReportDownloadButton module="attendance" filters={{ from, to }} filenamePrefix="org-attendance" />
        </div>
      </div>

      <AttendanceRecordsSection
        records={filteredRecords}
        isLoading={isLoading}
        month={rangeStart}
        showEmployeeColumn
        employeeNameById={employeeNameById}
        teamNameByEmployeeId={teamNameByEmployeeId}
        missingDays={missingDays}
        onMarkStatus={handleMarkStatus}
        // Admin bypasses attendance.view_photos/view_location unconditionally
        // (§7.4c's can() admin shortcut) — photo/location viewing is
        // completely unaffected by this task's editing-UI removal.
        showPhotos
        showLocation
      />
    </div>
  );
}

export default AdminAttendanceView;
