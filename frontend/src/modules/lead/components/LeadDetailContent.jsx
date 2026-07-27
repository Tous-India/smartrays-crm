import { Descriptions, List, Button, Space, Popconfirm } from "antd";
import {
  PhoneOutlined,
  FireOutlined,
  FireFilled,
  EditOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  CheckCircleFilled,
  CloseCircleOutlined,
  CloseCircleFilled,
  SwapOutlined,
} from "@ant-design/icons";
import PermissionGate from "../../../routes/PermissionGate";
import {
  CALL_OUTCOME_LABELS,
  CLIENT_TYPE_LABELS,
  ROOF_TYPE_LABELS,
  CONNECTION_TYPE_LABELS,
  SITE_SURVEY_STATUS_LABELS,
  LEAD_STATUS_PASTEL_COLORS,
} from "../constants/lead.constants";

// Solid AntD "green"/"red" (the same named colors LEAD_STATUS_COLORS maps
// won/lost to for the Status Tag/dropdown elsewhere) — used for the Won/Lost
// buttons' icon when active, since the pastel background itself is too
// light for the icon to read against.
const WON_ICON_COLOR = "#52c41a";
const LOST_ICON_COLOR = "#f5222d";
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
      {/* The status badge + hot icon live in the Drawer's own title now
          (see LeadDetailPage.jsx), inline next to the lead's name — moved
          from here per this task's own instruction, since a Tag floating in
          its own row above the action buttons read as disconnected from
          what it was actually describing. */}
      <div className="mb-4 flex items-center justify-end">
        <Space wrap>
          <PermissionGate module="leads" action="edit">
            <Button icon={<PhoneOutlined />} onClick={onLogCall}>
              Log Call
            </Button>
          </PermissionGate>
          <PermissionGate module="leads" action="edit">
            {/* Inline `style`, not a Tailwind className — AntD's `Button`
                sets its own icon/background color via injected CSS that a
                plain utility class loses to (verified: the icon stayed
                rgba(0,0,0,0.88) black even on a genuinely hot lead until
                switched to inline style, which always wins). Hot-state
                background is the same pastel blue as the "Needs Attention"
                section (#E8F1FB) for visual consistency; not-hot state is
                left as AntD's own default button styling, untouched. */}
            <Button
              style={lead.isHot ? { backgroundColor: "#E8F1FB" } : undefined}
              icon={
                lead.isHot ? (
                  <FireFilled style={{ color: "#fa8c16" }} />
                ) : (
                  <FireOutlined style={{ color: "#bfbfbf" }} />
                )
              }
              onClick={onToggleHot}
            >
              {lead.isHot ? "Remove Hot" : "Mark as Hot"}
            </Button>
          </PermissionGate>
          <PermissionGate module="leads" action="edit">
            {/* Same active/inactive treatment as the Hot button above —
                pastel background + solid icon only when the lead's REAL
                status matches, reusing LEAD_STATUS_PASTEL_COLORS
                (lead.constants.js, the same map the Status dropdown/Tag
                already derive from) rather than a new color. */}
            <Button
              style={lead.status === "won" ? { backgroundColor: LEAD_STATUS_PASTEL_COLORS.won } : undefined}
              icon={
                lead.status === "won" ? (
                  <CheckCircleFilled style={{ color: WON_ICON_COLOR }} />
                ) : (
                  <CheckCircleOutlined />
                )
              }
              onClick={onWon}
            >
              Won
            </Button>
          </PermissionGate>
          <PermissionGate module="leads" action="edit">
            {/* `danger` stays on regardless (that's this button's existing
                baseline look) — only the pastel fill + solid icon are
                conditional on the lead actually being lost. */}
            <Button
              danger
              style={lead.status === "lost" ? { backgroundColor: LEAD_STATUS_PASTEL_COLORS.lost } : undefined}
              icon={
                lead.status === "lost" ? (
                  <CloseCircleFilled style={{ color: LOST_ICON_COLOR }} />
                ) : (
                  <CloseCircleOutlined />
                )
              }
              onClick={onLost}
            >
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

      {/* Only rendered once a lead actually has solar fields — older test
          fixtures / any not-yet-migrated data has `clientType` undefined. */}
      {lead.clientType && (
        <>
          <h4 className="mb-2 font-medium">Site Details</h4>
          <Descriptions bordered column={2} size="small" className="!mb-6">
            <Descriptions.Item label="Client Type">
              {CLIENT_TYPE_LABELS[lead.clientType] || "—"}
            </Descriptions.Item>
            <Descriptions.Item label="Roof Type">{ROOF_TYPE_LABELS[lead.roofType] || "—"}</Descriptions.Item>
            <Descriptions.Item label="Site Address" span={2}>
              {lead.siteAddress || "—"}
            </Descriptions.Item>
            <Descriptions.Item label="Monthly Electricity Bill">
              {lead.monthlyElectricityBill != null ? lead.monthlyElectricityBill.toLocaleString() : "—"}
            </Descriptions.Item>
            <Descriptions.Item label="Estimated Units Consumed">
              {lead.estimatedUnitsConsumed != null ? lead.estimatedUnitsConsumed.toLocaleString() : "—"}
            </Descriptions.Item>
            <Descriptions.Item label="Estimated Capacity (kW)">
              {lead.estimatedCapacityKw != null ? lead.estimatedCapacityKw : "—"}
            </Descriptions.Item>
            <Descriptions.Item label="Connection Type">
              {CONNECTION_TYPE_LABELS[lead.connectionType] || "—"}
            </Descriptions.Item>
            {lead.clientType === "residential" && (
              <Descriptions.Item label="Subsidy Applicable">
                {lead.subsidyApplicable ? "Yes" : "No"}
              </Descriptions.Item>
            )}
            <Descriptions.Item label="Site Survey Status">
              {SITE_SURVEY_STATUS_LABELS[lead.siteSurveyStatus] || "—"}
            </Descriptions.Item>
            {lead.siteSurveyStatus && lead.siteSurveyStatus !== "not_scheduled" && (
              <Descriptions.Item label="Site Survey Date">
                {lead.siteSurveyDate ? new Date(lead.siteSurveyDate).toLocaleDateString() : "—"}
              </Descriptions.Item>
            )}
          </Descriptions>
        </>
      )}

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
