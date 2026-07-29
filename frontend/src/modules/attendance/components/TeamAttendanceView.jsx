import { useMemo, useState } from "react";
import dayjs from "dayjs";
import { DatePicker, Select, Space } from "antd";
import AttendanceRecordsSection from "./AttendanceRecordsSection";
import ReportDownloadButton from "../../../components/ReportDownloadButton";
import useTeamAttendance from "../hooks/useTeamAttendance";
import useUserDirectory from "../../../hooks/useUserDirectory";
import useSessionStore from "../../../store/sessionStore";

/**
 * `/attendance/team` — same shape as the Personal view, but for a manager's/
 * admin's visible team (§7.4's `GET /attendance/team`, `view_team`/
 * `view_all`). The backend has no per-employee filter on that endpoint, so
 * the employee selector filters the already-fetched month's records
 * client-side rather than re-fetching per employee. Route-level access is
 * gated by the page (`AttendanceTeamPage.jsx`, via `PermissionGate`), not
 * here — this component assumes it's already allowed to render.
 *
 * Admin manual-correction (§7.4 addition) — `defaultEmployeeId` (which
 * employee a brand-new record, from the toolbar's Add Record button, gets
 * created for) is only ever a single specific employee, never "All
 * employees" (there's no one valid target then) — `AttendanceRecordsSection`
 * disables that button in that case rather than guessing.
 */
function TeamAttendanceView() {
  const [month, setMonth] = useState(dayjs());
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const monthKey = month.format("YYYY-MM");
  const { records, isLoading, refetch } = useTeamAttendance(monthKey);
  const { users } = useUserDirectory();
  const currentUser = useSessionStore((state) => state.user);
  const isAdmin = currentUser?.role === "admin";

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

  const filteredRecords = selectedEmployeeId
    ? records.filter((record) => String(record.employeeId) === selectedEmployeeId)
    : records;

  const from = month.startOf("month").format("YYYY-MM-DD");
  const to = month.endOf("month").format("YYYY-MM-DD");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Space>
          <DatePicker picker="month" value={month} allowClear={false} onChange={(value) => setMonth(value || dayjs())} />
          <Select
            value={selectedEmployeeId}
            options={employeeOptions}
            style={{ width: 220 }}
            showSearch
            optionFilterProp="label"
            onChange={setSelectedEmployeeId}
          />
        </Space>
        <ReportDownloadButton module="attendance" filters={{ from, to }} filenamePrefix="team-attendance" />
      </div>

      <AttendanceRecordsSection
        records={filteredRecords}
        isLoading={isLoading}
        month={month}
        showEmployeeColumn={!selectedEmployeeId}
        employeeNameById={employeeNameById}
        canCorrect={isAdmin}
        defaultEmployeeId={selectedEmployeeId || null}
        onChanged={refetch}
      />
    </div>
  );
}

export default TeamAttendanceView;
