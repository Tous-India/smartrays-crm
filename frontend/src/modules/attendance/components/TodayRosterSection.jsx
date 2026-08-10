import { useMemo, useState } from "react";
import dayjs from "dayjs";
import { Alert, Button, Card, Input, Modal, Radio, Table, Tag, Tooltip, Typography } from "antd";
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

const LABEL_FOR = { present: "Full Day", half_day: "Half Day" };

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

  // §7.4h — the backend REQUIRES a reason on every manual mark and rejects
  // empty/whitespace in the service, so the UI collects it up front rather
  // than letting the user discover the rejection after clicking.
  const [pending, setPending] = useState(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Which already-marked row has been explicitly unlocked for a correction.
  // Marked rows are otherwise disabled: the buttons stay VISIBLE so the current
  // state still reads at a glance, but they no longer respond, so a row cannot
  // be re-marked by clicking again.
  const [editingId, setEditingId] = useState(null);

  function closePrompt() {
    setPending(null);
    setReason("");
    setError(null);
  }

  async function submitMark() {
    if (!reason.trim()) {
      // Mirrors the server's own rule rather than approximating it.
      setError("A reason is required.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await onSetState(pending.row, pending.status, reason.trim());
      setEditingId(null);
      closePrompt();
    } catch (submitError) {
      // Surface what the server actually said — failing silently here would
      // leave the roster looking unresponsive, which is how this was reported.
      setError(submitError?.response?.data?.message || "Could not save that mark. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

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
      title: "Reason",
      key: "reason",
      render: (_, row) => {
        // The two marks that predate §7.4h genuinely have no reason. A dash is
        // the honest rendering — nothing is backfilled, because inventing a
        // reason is exactly what this field exists to prevent.
        const value = row.record?.adjustmentReason;

        return value ? (
          <Tooltip title={value}>
            <Text className="text-xs">{value.length > 40 ? `${value.slice(0, 40)}…` : value}</Text>
          </Tooltip>
        ) : (
          <Text type="secondary">—</Text>
        );
      },
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
        // Already marked -> the buttons stay on screen but are inert, so the
        // state is still legible without being re-clickable. Correcting is a
        // deliberate act via Edit, which then goes through the same reason
        // prompt — the backend requires a fresh reason on every change.
        const isMarked = Boolean(record);
        const isUnlocked = editingId === row.employeeId;
        const locked = isMarked && !isUnlocked;

        return (
          <span className="flex items-center gap-2" data-testid={`roster-state-${row.employeeId}`}>
            <Tooltip title={locked ? "Already marked — use Edit to change it." : ""}>
              <Radio.Group
                size="small"
                optionType="button"
                buttonStyle="solid"
                value={record ? record.status : undefined}
                options={ROSTER_STATES}
                disabled={isSaving || locked}
                onChange={(event) => {
                  setReason("");
                  setError(null);
                  setPending({ row, status: event.target.value });
                }}
              />
            </Tooltip>

            {isMarked &&
              (isUnlocked ? (
                <Button size="small" type="link" onClick={() => setEditingId(null)}>
                  Cancel
                </Button>
              ) : (
                <Button
                  size="small"
                  type="link"
                  data-testid={`roster-edit-${row.employeeId}`}
                  onClick={() => setEditingId(row.employeeId)}
                >
                  Edit
                </Button>
              ))}
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

      {/*
        A correction captures its OWN reason — the field starts empty every
        time, including when changing Half Day to Full Day, because that is a
        new claim about the day rather than a restatement of the old one.
      */}
      <Modal
        open={Boolean(pending)}
        title={pending ? `Why is ${pending.row.name} marked ${LABEL_FOR[pending.status]}?` : ""}
        okText="Save mark"
        onOk={submitMark}
        confirmLoading={isSubmitting}
        onCancel={closePrompt}
        okButtonProps={{ disabled: !reason.trim(), "data-testid": "roster-reason-submit" }}
        destroyOnHidden
      >
        <p className="mb-2 text-xs text-gray-500">
          This mark carries no photo, location or heartbeat — the reason is the only record of what
          happened.
        </p>

        {error && <Alert type="error" showIcon className="!mb-3" message={error} data-testid="roster-reason-error" />}

        <Input.TextArea
          rows={3}
          value={reason}
          autoFocus
          data-testid="roster-reason-input"
          placeholder="e.g. No internet at the site all morning"
          onChange={(event) => setReason(event.target.value)}
        />
      </Modal>
    </Card>
  );
}

export { STATUS_LABELS };
export default TodayRosterSection;
export const todayKey = () => toLocalDateKey(dayjs());
