import { Table, Tag, Tooltip, Space } from "antd";
import { ExclamationCircleFilled, EnvironmentOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import AttendanceTimelineBar from "./AttendanceTimelineBar";
import GeofenceViolationBar from "./GeofenceViolationBar";
import { ATTENDANCE_STATUS_COLORS, ATTENDANCE_STATUS_LABELS } from "../constants/attendance.constants";

/**
 * Pure render of a set of Attendance records as a table — one row per day.
 * Reused by both the Personal view (`records` = own month) and the Team
 * view (`records` = the selected employee's records, filtered client-side
 * from the team fetch) rather than duplicating this table twice.
 *
 * `onRowClick` (opens `AttendancePhotoModal` in the parent) makes a row
 * double as the "click a day's record" entry point the photo viewer needs.
 * A manually-adjusted record (§7.4's admin-correction addition) gets a small
 * exclamation badge next to its Status Tag so it's never confused with a
 * real verified check-in at a glance. The per-row Edit action that used to
 * live here was removed — Attendance is UI-read-only for every role now.
 *
 * **Timeline column (§7.4e, 2026-08-04)** — the old separate Check-In/
 * Check-Out/Working Hours/Connectivity Gaps columns are gone, replaced by
 * one `AttendanceTimelineBar` showing the full day as a single 24-hour
 * color-segmented bar plus calculated duration stats. See that
 * component's own docblock (and `utils/attendanceTimeline.js`'s) for the
 * investigation and design behind the replacement. "Location" (geofence
 * violations) stays its own separate column, unaffected — it answers a
 * genuinely different question ("where," not "when") that the timeline bar
 * was never meant to absorb.
 */
function AttendanceTimeline({ records, isLoading, showEmployeeColumn, employeeNameById, onRowClick }) {
  const columns = [
    ...(showEmployeeColumn
      ? [
          {
            title: "Employee",
            dataIndex: "employeeId",
            render: (employeeId) => employeeNameById?.get(String(employeeId)) || "Unknown",
          },
        ]
      : []),
    {
      title: "Date",
      dataIndex: "date",
      render: (date) => dayjs(date).format("DD MMM YYYY"),
    },
    {
      title: "Timeline",
      key: "timeline",
      width: 260,
      render: (_, record) => <AttendanceTimelineBar record={record} />,
    },
    {
      title: (
        <Space size={4}>
          <EnvironmentOutlined />
          Location
        </Space>
      ),
      key: "geofence",
      width: 220,
      render: (_, record) => <GeofenceViolationBar record={record} />,
    },
    {
      title: "Status",
      dataIndex: "status",
      render: (status, record) => (
        <Space size={4}>
          <Tag color={ATTENDANCE_STATUS_COLORS[status]}>{ATTENDANCE_STATUS_LABELS[status]}</Tag>
          {record.isManuallyAdjusted && (
            <Tooltip title="Manually adjusted by admin — not a verified self-check-in">
              <ExclamationCircleFilled data-testid={`manual-marker-${record._id}`} className="text-amber-600" />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Table
      rowKey="_id"
      columns={columns}
      dataSource={records}
      loading={isLoading}
      pagination={false}
      onRow={onRowClick ? (record) => ({ onClick: () => onRowClick(record), className: "cursor-pointer" }) : undefined}
    />
  );
}

export default AttendanceTimeline;
