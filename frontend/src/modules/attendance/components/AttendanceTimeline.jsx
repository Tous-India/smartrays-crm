import { Table, Tag, Tooltip, Space, Button, Popconfirm } from "antd";
import {
  ExclamationCircleFilled,
  EnvironmentOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
} from "@ant-design/icons";
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
function AttendanceTimeline({
  records,
  isLoading,
  showEmployeeColumn,
  employeeNameById,
  teamNameByEmployeeId,
  onMarkStatus,
  onRowClick,
}) {
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
    // Team/Department (2026-08-05) — only rendered when the caller actually
    // supplies the mapping, so the Personal view (which has no notion of
    // other people's teams) is unaffected and needs no change.
    ...(teamNameByEmployeeId
      ? [
          {
            title: "Team",
            key: "team",
            dataIndex: "employeeId",
            render: (employeeId) => teamNameByEmployeeId.get(String(employeeId)) || "—",
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
      render: (_, record) => (record.isMissingDay ? null : <AttendanceTimelineBar record={record} />),
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
      render: (_, record) => (record.isMissingDay ? null : <GeofenceViolationBar record={record} />),
    },
    {
      title: "Status",
      dataIndex: "status",
      render: (status, record) =>
        record.isMissingDay ? (
          <Tag>No record</Tag>
        ) : (
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
    // Gap-filling actions (2026-08-05) — rendered ONLY on synthetic
    // missing-day rows, never on a real record. A record with real check-in
    // data has no actions here at all; Attendance stays read-only for those
    // (see `AttendanceRecordsSection`'s own docblock).
    ...(onMarkStatus
      ? [
          {
            title: "Actions",
            key: "actions",
            width: 110,
            render: (_, record) =>
              record.isMissingDay ? (
                <Space size={0}>
                  <Popconfirm
                    title="Mark this day as Absent?"
                    description={`${dayjs(record.date).format("DD MMM YYYY")} has no attendance record. This creates one — it can't be undone from here.`}
                    okText="Mark Absent"
                    okType="danger"
                    onConfirm={() => onMarkStatus(record, "absent")}
                  >
                    <Tooltip title="Mark Absent">
                      <Button type="text" danger size="small" icon={<CloseCircleOutlined />} aria-label="Mark Absent" />
                    </Tooltip>
                  </Popconfirm>
                  <Popconfirm
                    title="Mark this day as Half Day?"
                    description={`${dayjs(record.date).format("DD MMM YYYY")} has no attendance record. This creates one — it can't be undone from here.`}
                    okText="Mark Half Day"
                    onConfirm={() => onMarkStatus(record, "half_day")}
                  >
                    <Tooltip title="Mark Half Day">
                      <Button type="text" size="small" icon={<ClockCircleOutlined />} aria-label="Mark Half Day" />
                    </Tooltip>
                  </Popconfirm>
                </Space>
              ) : null,
          },
        ]
      : []),
  ];

  return (
    <Table
      rowKey="_id"
      columns={columns}
      dataSource={records}
      loading={isLoading}
      pagination={false}
      // A synthetic missing-day row has no photo/location to show, so it's
      // not clickable — opening the viewer on it would show an empty modal.
      onRow={
        onRowClick
          ? (record) =>
              record.isMissingDay
                ? {}
                : { onClick: () => onRowClick(record), className: "cursor-pointer" }
          : undefined
      }
    />
  );
}

export default AttendanceTimeline;
