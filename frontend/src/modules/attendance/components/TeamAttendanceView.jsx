import { useMemo, useState } from "react";
import dayjs from "dayjs";
import { DatePicker, Select, Space } from "antd";
import AttendanceRecordsSection from "./AttendanceRecordsSection";
import ReportDownloadButton from "../../../components/ReportDownloadButton";
import useTeamAttendance from "../hooks/useTeamAttendance";
import useUserDirectory from "../../../hooks/useUserDirectory";
import { usePermission } from "../../../hooks/usePermission";
import { ATTENDANCE_LIFECYCLE_FILTER_OPTIONS, deriveAttendanceLifecycleState } from "../constants/attendance.constants";

/**
 * `/attendance/team` — same shape as the Personal view, but for a manager's/
 * admin's visible team (§7.4's `GET /attendance/team`, `view_team`/
 * `view_all`). The backend has no per-employee filter on that endpoint, so
 * the employee selector filters the already-fetched month's records
 * client-side rather than re-fetching per employee. Route-level access is
 * gated by the page (`AttendanceTeamPage.jsx`, via `PermissionGate`), not
 * here — this component assumes it's already allowed to render.
 */
function TeamAttendanceView() {
  const [month, setMonth] = useState(dayjs());
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const monthKey = month.format("YYYY-MM");
  const { records, isLoading } = useTeamAttendance(monthKey);
  const { users } = useUserDirectory();

  // Permission-gated photo/location visibility (§7.4c) — independent grants,
  // admin bypasses both automatically via `usePermission`'s own admin
  // short-circuit. The backend already strips whichever field the viewer
  // lacks the grant for, so this only controls whether the photo-viewer
  // modal shows the section AT ALL (vs. a confusing empty "No photo"
  // placeholder that would look like a data problem rather than a
  // permission boundary) — see AttendancePhotoModal.jsx.
  const canSeePhotos = usePermission("attendance", "view_photos");
  const canSeeLocation = usePermission("attendance", "view_location");

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

  const filteredRecords = records
    .filter((record) => !selectedEmployeeId || String(record.employeeId) === selectedEmployeeId)
    .filter((record) => !selectedStatus || deriveAttendanceLifecycleState(record) === selectedStatus);

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
          <Select
            value={selectedStatus}
            options={ATTENDANCE_LIFECYCLE_FILTER_OPTIONS}
            style={{ width: 160 }}
            onChange={setSelectedStatus}
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
        showPhotos={canSeePhotos}
        showLocation={canSeeLocation}
      />
    </div>
  );
}

export default TeamAttendanceView;
