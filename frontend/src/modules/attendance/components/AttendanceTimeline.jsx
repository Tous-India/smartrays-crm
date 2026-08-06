import { useState } from "react";
import { Table, Tag, Tooltip, Space, Button, Popconfirm } from "antd";
import {
  ExclamationCircleFilled,
  AimOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  EyeOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import AttendanceTimelineBar from "./AttendanceTimelineBar";
import GeofenceViolationBar from "./GeofenceViolationBar";
import AttendanceLocationMapModal from "./AttendanceLocationMapModal";
import { ATTENDANCE_STATUS_COLORS, ATTENDANCE_STATUS_LABELS } from "../constants/attendance.constants";

/**
 * Pure render of a set of Attendance records as a table — one row per day.
 * Reused by both the Personal view (`records` = own month) and the Team
 * view (`records` = the selected employee's records, filtered client-side
 * from the team fetch) rather than duplicating this table twice.
 *
 * `onRowClick` (opens `AttendancePhotoModal` in the parent) is reached from
 * the explicit "View details" action in the Actions cell (§7.4h, 2026-08-06).
 * It used to be wired to `onRow`, making the WHOLE row a button: every column
 * opened the same modal, byte-identical, with nothing signalling it. The two
 * columns carrying visual widgets got clicked and looked like they "did the
 * same thing" — in fact Date and Status did too. One explicit affordance
 * replaces that; the row itself is inert.
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
  // §7.4g — the Geofence chip opens the map for THIS record's employee and
  // date. `LiveTrackingMap` cannot serve that: it is live-only
  // (`GET /location/live`, open shifts, today) and takes no employee/date
  // input, so it can never show a past row's trail. `AttendanceLocationMapModal`
  // already locks `HistoryMapView` to one record's employee/day and plots the
  // violation points, so the chip reuses it rather than inventing a route.
  const [mapRecord, setMapRecord] = useState(null);

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
      // Renamed from "Location" (§7.4g) — that read as "where were they",
      // which is the Live Map's question. This column answers "how far from
      // the check-in point", which is the geofence.
      title: (
        <Space size={4}>
          <AimOutlined />
          Geofence
        </Space>
      ),
      key: "geofence",
      width: 200,
      render: (_, record) =>
        record.isMissingDay ? null : (
          <GeofenceViolationBar record={record} onInvestigate={setMapRecord} />
        ),
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
    // §7.4h (2026-08-06) — this column is now ALWAYS rendered, because it
    // carries the only way to open the detail modal. It used to appear only
    // when `onMarkStatus` was supplied, which is admin-only.
    //
    // Gap-filling actions (2026-08-05) are still rendered ONLY on synthetic
    // missing-day rows, never on a real record. Attendance stays read-only
    // for those (see `AttendanceRecordsSection`'s own docblock).
    {
      title: "Actions",
      key: "actions",
      width: 130,
      render: (_, record) =>
        record.isMissingDay ? (
          onMarkStatus ? (
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
          ) : null
        ) : (
          // A missing-day row has no photo/location/timeline to show, so it
          // gets no Details action — opening the modal on it would show an
          // empty record.
          onRowClick && (
            <Tooltip title="View details">
              <Button
                type="text"
                size="small"
                icon={<EyeOutlined />}
                aria-label="View details"
                data-testid={`attendance-details-${record._id}`}
                onClick={() => onRowClick(record)}
              />
            </Tooltip>
          )
        ),
    },
  ];

  return (
    <>
    <Table
      rowKey="_id"
      columns={columns}
      dataSource={records}
      loading={isLoading}
      pagination={false}
      // §B1 (2026-08-05) — the table is wider than a phone; without this it
      // pushed the whole PAGE into horizontal scroll at 390px. AntD now
      // scrolls it inside its own container instead, the same treatment the
      // Leave table already had.
      scroll={{ x: "max-content" }}
      // §7.4h — NO row-level onClick. It made every cell open the same modal
      // with no signal that it would, so the two columns that look
      // interactive (the Timeline bar, the Geofence chip) got clicked and
      // appeared to "do the same thing" — they were not special; Date and
      // Status opened it too. The explicit Details action above is the only
      // route now. Keeping both would just re-create the ambiguity.
    />
    <AttendanceLocationMapModal
      open={Boolean(mapRecord)}
      record={mapRecord}
      onCancel={() => setMapRecord(null)}
    />
    </>
  );
}

export default AttendanceTimeline;
