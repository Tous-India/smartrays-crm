import { Table, Tag } from "antd";
import dayjs from "dayjs";
import ConnectivityGapBar from "./ConnectivityGapBar";
import { ATTENDANCE_STATUS_COLORS, ATTENDANCE_STATUS_LABELS } from "../constants/attendance.constants";

/**
 * Pure render of a set of Attendance records as a table — one row per day,
 * working hours and connectivity gaps (§6.5) both shown per §7.4's stated
 * requirement. Reused by both the Personal view (`records` = own month) and
 * the Team view (`records` = the selected employee's records, filtered
 * client-side from the team fetch) rather than duplicating this table twice.
 */
function AttendanceTimeline({ records, isLoading, showEmployeeColumn, employeeNameById }) {
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
      title: "Status",
      dataIndex: "status",
      render: (status) => <Tag color={ATTENDANCE_STATUS_COLORS[status]}>{ATTENDANCE_STATUS_LABELS[status]}</Tag>,
    },
  ];

  return <Table rowKey="_id" columns={columns} dataSource={records} loading={isLoading} pagination={false} />;
}

export default AttendanceTimeline;
