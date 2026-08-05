import dayjs from "dayjs";
import { Card, Col, Row, Tag, Button, Popconfirm, Space, Tooltip, Empty, Typography } from "antd";
import { CheckOutlined, CloseOutlined, ExclamationCircleOutlined, DeleteOutlined } from "@ant-design/icons";
import { LEAVE_TYPE_LABELS } from "../constants/leave.constants";

const { Text, Paragraph } = Typography;

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
    <Row gutter={[16, 16]}>
      {requests.map((leave) => {
        const actionable = canActOnRow(leave);
        const teamName = teamNameByEmployeeId?.get(String(leave.employeeId));

        return (
          <Col key={leave._id} xs={24} md={12} xl={8}>
            <Card size="small" className="h-full" data-testid={`leave-approval-card-${leave._id}`}>
              <div className="mb-1 flex items-start justify-between gap-2">
                <Text strong>{employeeNameById.get(String(leave.employeeId)) || "Unknown"}</Text>
                <Tag color={leave.type === "paid" ? "blue" : "default"}>{LEAVE_TYPE_LABELS[leave.type]}</Tag>
              </div>

              {teamName && <div className="mb-1 text-xs text-gray-400">{teamName}</div>}

              <div className="text-xs text-gray-500">
                {dayjs(leave.startDate).format("DD MMM YYYY")} – {dayjs(leave.endDate).format("DD MMM YYYY")}
                {leave.isHalfDay && (
                  <Tag color="cyan" className="ml-2">
                    Half Day
                  </Tag>
                )}
              </div>

              {/* Full reason, not truncated — it's the field the decision
                  actually turns on. */}
              <Paragraph className="mt-2 !mb-3 text-sm">{leave.reason || <Text type="secondary">No reason given</Text>}</Paragraph>

              {actionable && (
                <Space>
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
            </Card>
          </Col>
        );
      })}
    </Row>
  );
}

export default LeaveApprovalCards;
