import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { DatePicker, Select, Space } from "antd";
import AttendanceRecordsSection from "./AttendanceRecordsSection";
import ReportDownloadButton from "../../../components/ReportDownloadButton";
import { getTeamAttendance } from "../api/attendanceApi";
import { listUsers } from "../../user/api/userApi";
import useTeams from "../../team/hooks/useTeams";
import useUserDirectory from "../../../hooks/useUserDirectory";
import { ATTENDANCE_LIFECYCLE_FILTER_OPTIONS, deriveAttendanceLifecycleState } from "../constants/attendance.constants";

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
 * Five filters, per this task: Employee, Team, Status (all three mirror
 * `TeamAttendanceView`'s own filter-bar pattern), a month `DatePicker`
 * (existing pattern), and a separate Custom Date Range `RangePicker` for an
 * arbitrary span. The backend's `GET /attendance/team` only accepts a single
 * `month=`, not a range — rather than adding a new backend endpoint for what
 * is fundamentally the same data, a custom range fetches every calendar
 * month it touches (almost always 1, occasionally 2 for a month-straddling
 * range) and merges the results, then narrows to the exact day span
 * client-side. The Team filter needs each employee's `managerId`, which the
 * lightweight `useUserDirectory()` dropdown doesn't return — a full roster
 * fetch (`GET /users`) is made instead, matching the same reasoning the
 * Leave module's own Admin Team filter (§7.5c) already established, and
 * built against the real `Team` entity (`useTeams()`) rather than a
 * manager-list stand-in, to avoid that same filter's now-fixed bug (§7.5d).
 */
function AdminAttendanceView() {
  const [month, setMonth] = useState(dayjs());
  const [customRange, setCustomRange] = useState(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const [records, setRecords] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

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

  const monthKey = month.format("YYYY-MM");

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    const monthKeys = customRange
      ? distinctMonthKeys(customRange[0], customRange[1])
      : [monthKey];

    Promise.all(monthKeys.map((key) => getTeamAttendance(key)))
      .then((responses) => {
        if (cancelled) {
          return;
        }

        const merged = responses.flatMap((response) => response.data.data);

        if (!customRange) {
          setRecords(merged);
          return;
        }

        const rangeStartMs = customRange[0].startOf("day").valueOf();
        const rangeEndMs = customRange[1].endOf("day").valueOf();
        setRecords(
          merged.filter((record) => {
            const recordMs = dayjs(record.date).valueOf();
            return recordMs >= rangeStartMs && recordMs <= rangeEndMs;
          })
        );
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [monthKey, customRange]);

  const employeeNameById = useMemo(() => new Map(users.map((user) => [user._id, user.name])), [users]);

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

  const from = (customRange ? customRange[0] : month.startOf("month")).format("YYYY-MM-DD");
  const to = (customRange ? customRange[1] : month.endOf("month")).format("YYYY-MM-DD");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Space wrap>
          <DatePicker
            picker="month"
            value={month}
            allowClear={false}
            disabled={Boolean(customRange)}
            onChange={(value) => setMonth(value || dayjs())}
          />
          <RangePicker value={customRange} onChange={setCustomRange} allowClear />
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
        </Space>
        <ReportDownloadButton module="attendance" filters={{ from, to }} filenamePrefix="org-attendance" />
      </div>

      <AttendanceRecordsSection
        records={filteredRecords}
        isLoading={isLoading}
        month={month}
        showEmployeeColumn={!selectedEmployeeId}
        employeeNameById={employeeNameById}
        // Admin bypasses attendance.view_photos/view_location unconditionally
        // (§7.4c's can() admin shortcut) — photo/location viewing is
        // completely unaffected by this task's editing-UI removal.
        showPhotos
        showLocation
      />
    </div>
  );
}

function distinctMonthKeys(start, end) {
  const keys = [];
  let cursor = start.startOf("month");
  const last = end.startOf("month");

  while (cursor.isBefore(last) || cursor.isSame(last, "month")) {
    keys.push(cursor.format("YYYY-MM"));
    cursor = cursor.add(1, "month");
  }

  return keys;
}

export default AdminAttendanceView;
