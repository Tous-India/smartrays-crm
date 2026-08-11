import dayjs from "dayjs";
import { Tag, Button, Popconfirm, Space, Tooltip, Empty, Typography } from "antd";
import { CheckOutlined, CloseOutlined, ExclamationCircleOutlined, DeleteOutlined } from "@ant-design/icons";
import { LEAVE_TYPE_LABELS } from "../constants/leave.constants";

const { Text } = Typography;

/**
 * Pending leave requests as decision cards (§B2, 2026-08-05).
 *
 * A pending request is a thing someone has to ACT on, and the old table row
 * truncated the reason — the single most important field for deciding —
 * behind an ellipsis tooltip. Cards give the reason room to be read in full
 * without a hover, and put the three decisions next to it.
 *
 * Only pending requests render here. Anything already decided is history and
 * belongs in the history TABLE, where scanning and comparing rows matters
 * more than reading any one of them.
 *
 * Actions keep the icon + Tooltip + `aria-label` pattern the table already
 * used (§7.5f), and the same per-row scope gate: `canActOnRow` mirrors the
 * backend's `ensureCanActOnLeave`, so a manager never sees actions on their
 * OWN request, which the backend always rejects.
 */
function LeaveApprovalCards({
  requests,
  employeeNameById,
  teamNameByEmployeeId,
  canApprove,
  canDecline,
  canMarkAbsence,
  canDelete,
  canActOnRow,
  onApprove,
  onDecline,
  onMarkAbsence,
  onDelete,
}) {
  if (requests.length === 0) {
    return <Empty description="No pending leave requests" />;
  }

  return (
    <div className="flex flex-col gap-3" data-testid="leave-approval-strips">
      {requests.map((leave) => {
        const actionable = canActOnRow(leave);
        const teamName = teamNameByEmployeeId?.get(String(leave.employeeId));

        return (
          <div
            key={leave._id}
            // `app-elevated-card` is the shared surface used by cards
            // elsewhere; a bespoke shadow here would drift from them. Its own
            // vertical margin is overridden — the stack's `gap-3` owns spacing
            // between strips, so a second source would double it.
            className="app-elevated-card !my-0 flex w-full flex-wrap items-center gap-x-4 gap-y-2 rounded-lg bg-white px-4 py-3"
            data-testid={`leave-approval-card-${leave._id}`}
          >
            {/* Fixed-ish fields take only what they need; `reason` below gets
                the flexible space, since it and the name are the only
                variable-length ones and the reason is what the decision turns
                on. */}
            <Text strong className="shrink-0">
              {employeeNameById.get(String(leave.employeeId)) || "Unknown"}
            </Text>

            {teamName && (
              <Text type="secondary" className="shrink-0 text-xs">
                {teamName}
              </Text>
            )}

            <Tag className="shrink-0 !me-0" color={leave.type === "paid" ? "blue" : "default"}>
              {LEAVE_TYPE_LABELS[leave.type]}
            </Tag>

            <Tag className="shrink-0 !me-0" color={leave.isHalfDay ? "cyan" : "default"}>
              {leave.isHalfDay ? "Half Day" : "Full Day"}
            </Tag>

            <Text type="secondary" className="shrink-0 whitespace-nowrap text-xs">
              {dayjs(leave.startDate).format("DD MMM YYYY")} – {dayjs(leave.endDate).format("DD MMM YYYY")}
            </Text>

            {/* Truncated rather than wrapped: a strip is one line, and the full
                text is a hover away. `min-w-0` is what actually lets a flex
                child shrink below its content width — without it `truncate`
                silently does nothing. */}
            <Tooltip title={leave.reason || "No reason given"}>
              <span className="min-w-0 flex-1 truncate text-sm" data-testid={`leave-reason-${leave._id}`}>
                {leave.reason || <Text type="secondary">No reason given</Text>}
              </span>
            </Tooltip>

            {actionable && (
              <Space className="ms-auto shrink-0" data-testid={`leave-actions-${leave._id}`}>
                  {canApprove && (
                    <Popconfirm
                      title="Approve this leave request?"
                      okText="Confirm Approval"
                      onConfirm={() => onApprove(leave)}
                    >
                      <Tooltip title="Approve">
                        <Button type="text" size="small" icon={<CheckOutlined />} aria-label="Approve" />
                      </Tooltip>
                    </Popconfirm>
                  )}
                  {canDecline && (
                    <Tooltip title="Decline">
                      <Button
                        type="text"
                        danger
                        size="small"
                        icon={<CloseOutlined />}
                        aria-label="Decline"
                        onClick={() => onDecline(leave)}
                      />
                    </Tooltip>
                  )}
                  {canMarkAbsence && (
                    <Popconfirm
                      title="Mark as an unapproved absence?"
                      description="This counts as a DOUBLE (2x) deduction against this employee's leave balance, regardless of the request's current status."
                      okText="Mark Absence (2x)"
                      okType="danger"
                      onConfirm={() => onMarkAbsence(leave)}
                    >
                      <Tooltip title="Mark Unapproved Absence">
                        <Button
                          type="text"
                          danger
                          size="small"
                          icon={<ExclamationCircleOutlined />}
                          aria-label="Mark Unapproved Absence"
                        />
                      </Tooltip>
                    </Popconfirm>
                  )}
                  {/* Delete is carried over from the table (§B5) — a pending
                      request now renders ONLY as a card, so omitting it here
                      would silently remove the ability to delete one. */}
                  {canDelete && (
                    <Popconfirm
                      title="Delete this leave request?"
                      description="This cannot be undone."
                      okText="Confirm Delete"
                      okType="danger"
                      onConfirm={() => onDelete(leave)}
                    >
                      <Tooltip title="Delete">
                        <Button type="text" danger size="small" icon={<DeleteOutlined />} aria-label="Delete" />
                      </Tooltip>
                    </Popconfirm>
                  )}
              </Space>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default LeaveApprovalCards;
