import { Table, Tag, Tooltip, Space } from "antd";
import { ExclamationCircleFilled, EnvironmentOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import ConnectivityGapBar from "./ConnectivityGapBar";
import GeofenceViolationBar from "./GeofenceViolationBar";
import { ATTENDANCE_STATUS_COLORS, ATTENDANCE_STATUS_LABELS } from "../constants/attendance.constants";

/**
 * Pure render of a set of Attendance records as a table — one row per day,
 * working hours and connectivity gaps (§6.5) both shown per §7.4's stated
 * requirement. Reused by both the Personal view (`records` = own month) and
 * the Team view (`records` = the selected employee's records, filtered
 * client-side from the team fetch) rather than duplicating this table twice.
 *
 * `onRowClick` (opens `AttendancePhotoModal` in the parent) makes a row
 * double as the "click a day's record" entry point the photo viewer needs,
 * the same behavior `AttendanceCalendar`'s day cells offer in the grid view
 * — clicking a record here or there both do the same thing. A manually-
 * adjusted record (§7.4's admin-correction addition) gets a small
 * exclamation badge next to its Status Tag so it's never confused with a
 * real verified check-in at a glance. The per-row Edit action that used to
 * live here was removed — Attendance is UI-read-only for every role now.
 *
 * A separate "Location" column (added later, geofencing §6.5/§7.4) —
 * deliberately its own column, not overlaid onto the "Connectivity Gaps"
 * bar, so a `EnvironmentOutlined`-labeled header plus `GeofenceViolationBar`'s
 * distinct orange (vs. connectivity's red) makes it immediately clear which
 * *kind* of issue occurred, not just that "something was wrong" that shift.
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
      title: "Check-In",
      dataIndex: ["checkIn", "time"],
      render: (time) => (time ? dayjs(time).format("HH:mm:ss") : "-"),
    },
    {
      title: "Check-Out",
      dataIndex: ["checkOut", "time"],
      render: (time) => (time ? dayjs(time).format("HH:mm:ss") : "-"),
    },
    {
      title: "Working Hours",
      dataIndex: "workingHours",
      render: (hours) => (hours != null ? `${hours.toFixed(2)}h` : "-"),
    },
    {
      title: "Connectivity Gaps",
      key: "gaps",
      width: 220,
      render: (_, record) => <ConnectivityGapBar record={record} />,
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
