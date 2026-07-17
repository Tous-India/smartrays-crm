import { Descriptions, Tag, List, Button, Space, Popconfirm } from "antd";
import {
  PhoneOutlined,
  FireOutlined,
  FireFilled,
  EditOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  SwapOutlined,
} from "@ant-design/icons";
import PermissionGate from "../../../routes/PermissionGate";
import { LEAD_STATUS_COLORS, LEAD_STATUS_LABELS, CALL_OUTCOME_LABELS } from "../constants/lead.constants";
import { buildActivityTimeline } from "../utils/buildActivityTimeline";

/**
 * The slide-over's body: fields, call history, the assembled activity
 * timeline (see buildActivityTimeline.js for why this is assembled
 * client-side rather than fetched from a dedicated endpoint), and the
 * action buttons from leads-customer-functional-spec.md's Detail View
 * Actions list.
 */
function LeadDetailContent({
  lead,
  callHistory,
  ownerName,
  onLogCall,
  onToggleHot,
  onWon,
  onLost,
  onConvert,
  onEdit,
  onDelete,
}) {
  const timeline = buildActivityTimeline(lead, callHistory);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <Space>
          {lead.isHot && <FireFilled className="text-orange-500" title="Hot lead" />}
          <Tag color={LEAD_STATUS_COLORS[lead.status]}>{LEAD_STATUS_LABELS[lead.status]}</Tag>
        </Space>

        <Space wrap>
          <PermissionGate module="leads" action="edit">
            <Button icon={<PhoneOutlined />} onClick={onLogCall}>
              Log Call
            </Button>
          </PermissionGate>
          <PermissionGate module="leads" action="edit">
            <Button icon={lead.isHot ? <FireFilled /> : <FireOutlined />} onClick={onToggleHot}>
              {lead.isHot ? "Remove Hot" : "Mark as Hot"}
            </Button>
          </PermissionGate>
          <PermissionGate module="leads" action="edit">
            <Button icon={<CheckCircleOutlined />} onClick={onWon}>
              Won
            </Button>
          </PermissionGate>
          <PermissionGate module="leads" action="edit">
            <Button danger icon={<CloseCircleOutlined />} onClick={onLost}>
              Lost
            </Button>
          </PermissionGate>
          <PermissionGate module="leads" action="edit">
            <Button icon={<SwapOutlined />} onClick={onConvert}>
              Convert to Customer
            </Button>
          </PermissionGate>
          <PermissionGate module="leads" action="edit">
            <Button icon={<EditOutlined />} onClick={onEdit}>
              Edit
            </Button>
          </PermissionGate>
          <PermissionGate module="leads" action="delete">
            <Popconfirm title="Delete this lead?" okText="Delete" okType="danger" onConfirm={onDelete}>
              <Button danger icon={<DeleteOutlined />}>
                Delete
              </Button>
            </Popconfirm>
          </PermissionGate>
        </Space>
      </div>

      <Descriptions bordered column={2} size="small" className="!mb-6">
        <Descriptions.Item label="Name">{lead.name}</Descriptions.Item>
        <Descriptions.Item label="Company">{lead.companyName || "—"}</Descriptions.Item>
        <Descriptions.Item label="Email">{lead.email || "—"}</Descriptions.Item>
        <Descriptions.Item label="Phone">{lead.phone || "—"}</Descriptions.Item>
        <Descriptions.Item label="Source">{lead.source || "—"}</Descriptions.Item>
        <Descriptions.Item label="Owner">{ownerName || "—"}</Descriptions.Item>
        <Descriptions.Item label="Budget">
          {lead.budget != null ? lead.budget.toLocaleString() : "—"}
        </Descriptions.Item>
        <Descriptions.Item label="Follow-up">
          {lead.followUpDate ? new Date(lead.followUpDate).toLocaleString() : "—"}
        </Descriptions.Item>
        <Descriptions.Item label="Follow-up Note" span={2}>
          {lead.followUpNote || "—"}
        </Descriptions.Item>
        <Descriptions.Item label="Notes" span={2}>
          {lead.notes || "—"}
        </Descriptions.Item>
      </Descriptions>

      <h4 className="mb-2 font-medium">Call History</h4>
      <List
        size="small"
        className="!mb-6"
        dataSource={callHistory}
        locale={{ emptyText: "No calls logged yet" }}
        renderItem={(call) => (
          <List.Item>
            <div>
              <div>
                {new Date(call.calledAt).toLocaleString()} —{" "}
                {CALL_OUTCOME_LABELS[call.outcome] || call.outcome}
              </div>
              {call.notes && <div className="text-xs text-gray-500">{call.notes}</div>}
            </div>
          </List.Item>
        )}
      />

      <h4 className="mb-2 font-medium">Activity Timeline</h4>
      <List
        size="small"
        dataSource={timeline}
        renderItem={(entry) => (
          <List.Item key={entry.key}>
            <span className="text-xs text-gray-500">{new Date(entry.date).toLocaleString()}</span>
            <span className="ml-2">{entry.description}</span>
          </List.Item>
        )}
      />
    </div>
  );
}

export default LeadDetailContent;
