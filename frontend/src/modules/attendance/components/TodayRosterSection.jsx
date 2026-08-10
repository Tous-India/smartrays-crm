import { useMemo } from "react";
import dayjs from "dayjs";
import { Card, Radio, Table, Tag, Tooltip, Typography } from "antd";
import { toLocalDateKey } from "../../../utils/date.utils";

const { Text } = Typography;

/**
 * Today's roster (§7.4g, 2026-08-09) — a way to mark people who genuinely
 * could not check in: no internet, dead phone, app not loading.
 *
 * ALWAYS TODAY. It deliberately ignores the page's date-range filter, because
 * this is an action list for right now, not a view of history. The heading
 * says so plainly so it is never confused with the filtered records table
 * below it, which is the one the filters do drive.
 *
 * THREE STATES, mapped onto the existing status enum — no new values:
 *   Half Day  -> half_day   (present for that portion)
 *   Full Day  -> present    (present for the whole day)
 *   On Leave  -> on_leave   DISPLAY ONLY
 *
 * `On Leave` cannot be chosen. It is written solely by leave approval
 * (`leave.service.js`), which is why `on_leave` is excluded from the backend's
 * MARKABLE_STATUSES: setting it by hand would assert a leave state with no
 * leave record behind it. Approving full-day leave puts someone here as On
 * Leave; approving half-day puts them at Half Day. One-way — nothing on this
 * screen ever writes back to a leave record.
 *
 * A row whose record came from a REAL check-in renders as plain text, not a
 * disabled control: that record carries a photo, coordinates and heartbeat
 * data that cannot be reconstructed, and a manual mark must never overwrite
 * it. The backend refuses it too (`attendance.service.js`), so this is the
 * courtesy, not the guarantee.
 */

export const ROSTER_STATES = [
  { value: "half_day", label: "Half Day" },
  { value: "present", label: "Full Day" },
];

const STATUS_LABELS = {
  present: "Full Day",
  half_day: "Half Day",
  on_leave: "On Leave",
  absent: "Absent",
};

/** A record the roster may still change: marked by hand, no device evidence. */
export function isManualRecord(record) {
  return Boolean(record) && !record.checkIn?.time;
}

function TodayRosterSection({ employees, recordsByEmployeeId, isSaving, onSetState }) {
  const today = dayjs();

  const rows = useMemo(
    () =>
      employees.map((employee) => {
        const record = recordsByEmployeeId.get(String(employee._id)) || null;

        return {
          key: String(employee._id),
          employeeId: String(employee._id),
          name: employee.name,
          designation: employee.designation || "—",
          record,
        };
      }),
    [employees, recordsByEmployeeId]
  );

  const columns = [
    { title: "Name", dataIndex: "name", key: "name" },
    {
      title: "Designation",
      dataIndex: "designation",
      key: "designation",
      render: (value) => <Text type={value === "—" ? "secondary" : undefined}>{value}</Text>,
    },
    {
      title: "Today",
      key: "state",
      width: 300,
      render: (_, row) => {
        const { record } = row;

        // A real check-in — non-interactive text, with the reason on hover.
        if (record && !isManualRecord(record)) {
          return (
            <Tooltip title="Checked in from their device — a manual mark would overwrite the photo and location captured with it.">
              <span data-testid={`roster-locked-${row.employeeId}`}>
                <Tag color="green">{STATUS_LABELS[record.status] || record.status}</Tag>
                <Text type="secondary" className="text-xs">
                  checked in
                </Text>
              </span>
            </Tooltip>
          );
        }

        // On approved leave — written by the Leave module, never set here.
        if (record?.status === "on_leave") {
          return (
            <Tooltip title="On approved leave. This comes from the leave request and can only be changed there.">
              <span data-testid={`roster-onleave-${row.employeeId}`}>
                <Tag color="purple">On Leave</Tag>
              </span>
            </Tooltip>
          );
        }

        // Radio buttons, NOT a Segmented: Segmented paints its first option as
        // selected when `value` is undefined, so an UNMARKED employee looked
        // like a Half Day someone had already recorded — and clicking it was a
        // no-op, since the control already considered it current. Radios leave
        // nothing selected until a choice is actually made, which is the honest
        // rendering of "not marked yet", and they are genuinely mutually
        // exclusive rather than merely looking it.
        return (
          <span data-testid={`roster-state-${row.employeeId}`}>
            <Radio.Group
              size="small"
              optionType="button"
              buttonStyle="solid"
              value={record ? record.status : undefined}
              options={ROSTER_STATES}
              disabled={isSaving}
              onChange={(event) => onSetState(row, event.target.value)}
            />
          </span>
        );
      },
    },
  ];

  return (
    <Card
      size="small"
      className="app-elevated-card"
      data-testid="today-roster"
      title={
        <div className="flex items-baseline gap-2">
          <span>Today&apos;s roster</span>
          <Text type="secondary" className="text-xs font-normal">
            {today.format("ddd, DD MMM YYYY")} — mark anyone who couldn&apos;t check in
          </Text>
        </div>
      }
    >
      <Table
        rowKey="key"
        size="small"
        columns={columns}
        dataSource={rows}
        pagination={false}
        scroll={{ y: 260 }}
        locale={{ emptyText: "No active employees" }}
      />
    </Card>
  );
}

export { STATUS_LABELS };
export default TodayRosterSection;
export const todayKey = () => toLocalDateKey(dayjs());
