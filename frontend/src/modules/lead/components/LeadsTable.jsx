import { Table, Tag, Select, Button, Tooltip } from "antd";
import { FireOutlined, FireFilled } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import LeadStatusSelect from "./LeadStatusSelect";
import LeadFollowUpCell from "./LeadFollowUpCell";
import PermissionGate from "../../../routes/PermissionGate";
import { LEAD_STATUS_COLORS, LEAD_STATUS_LABELS, CLIENT_TYPE_LABELS } from "../constants/lead.constants";

function isOverdue(followUpDate) {
  return followUpDate && new Date(followUpDate) < new Date();
}

/**
 * Table View per leads-customer-functional-spec.md: Name, Company, Status,
 * Source, Owner, Follow-up, Budget, Created columns; status changes via an
 * inline dropdown; overdue follow-ups highlighted red. Row actions (hot
 * toggle, assign owner) are quick actions available without opening the
 * detail slide-over, per the spec's "Quick Actions (from list/board)".
 */
function LeadsTable({
  leads,
  isLoading,
  users,
  canEdit,
  canReassignOwner,
  onRequestStatusChange,
  onToggleHot,
  onAssignOwner,
  onRescheduleFollowUp,
}) {
  const navigate = useNavigate();

  const userNameById = new Map(users.map((user) => [user._id, user.name]));

  const columns = [
    {
      title: "Name",
      dataIndex: "name",
      render: (name, lead) => (
        <span className="flex items-center gap-1">
          {lead.isHot && <FireFilled className="text-orange-500" title="Hot lead" />}
          {name}
        </span>
      ),
    },
    { title: "Company", dataIndex: "companyName", render: (value) => value || "—" },
    {
      title: "Status",
      dataIndex: "status",
      render: (_, lead) =>
        canEdit ? (
          <LeadStatusSelect lead={lead} onRequestChange={onRequestStatusChange} />
        ) : (
          <Tag color={LEAD_STATUS_COLORS[lead.status]}>{LEAD_STATUS_LABELS[lead.status]}</Tag>
        ),
    },
    { title: "Source", dataIndex: "source", render: (value) => value || "—" },
    {
      title: "Client Type",
      dataIndex: "clientType",
      render: (value) => CLIENT_TYPE_LABELS[value] || "—",
    },
    {
      title: "Owner",
      dataIndex: "ownerId",
      render: (ownerId, lead) => {
        // `GET /users/dropdown` only returns active users
        // (`user.service.js#listUsersForDropdown`, `isActive: true`) — a
        // lead owned by a since-deactivated user has no matching entry
        // here. Left alone, AntD's `<Select>` falls back to rendering the
        // raw `value` (the owner's ObjectId) when it can't find a matching
        // option's label — the exact bug this guards against. A synthetic
        // "Unknown user" option keeps the Select always showing real text,
        // never a raw id, while `disabled` prevents actually assigning
        // ownership back onto a placeholder.
        const knownOwnerOptions = users.map((user) => ({ value: user._id, label: user.name }));
        const ownerIsKnown = !ownerId || userNameById.has(ownerId);
        const options = ownerIsKnown
          ? knownOwnerOptions
          : [...knownOwnerOptions, { value: ownerId, label: "Unknown user", disabled: true }];

        if (!canReassignOwner) {
          return userNameById.get(ownerId) || (ownerId ? "Unknown user" : "—");
        }

        // While the directory is still loading, `users` is `[]` — every
        // owner would otherwise look "unknown" for a moment. A plain
        // loading placeholder avoids ever rendering the Select (and its
        // raw-value fallback) before there's real data to resolve against.
        if (users.length === 0) {
          return <span className="text-gray-400">Loading…</span>;
        }

        return (
          <Select
            size="small"
            value={ownerId}
            style={{ minWidth: 140 }}
            options={options}
            onClick={(event) => event.stopPropagation()}
            onChange={(newOwnerId) => onAssignOwner(lead, newOwnerId)}
          />
        );
      },
    },
    {
      title: "Follow-up",
      dataIndex: "followUpDate",
      // Inline-editable when the caller holds `leads.edit` — same
      // permission check already gating the Status dropdown, per this
      // task's own instruction to reuse it rather than introducing a
      // separate check. Read-only rendering (no grant) is unchanged from
      // before.
      render: (value, lead) =>
        canEdit ? (
          <LeadFollowUpCell lead={lead} onReschedule={onRescheduleFollowUp} />
        ) : value ? (
          <span className={isOverdue(value) ? "font-medium text-red-600" : ""}>
            {new Date(value).toLocaleDateString()}
          </span>
        ) : (
          "—"
        ),
    },
    {
      title: "Budget",
      dataIndex: "budget",
      render: (value) => (value != null ? value.toLocaleString() : "—"),
    },
    {
      title: "Created",
      dataIndex: "createdAt",
      render: (value) => new Date(value).toLocaleDateString(),
    },
    {
      title: "Actions",
      key: "actions",
      render: (_, lead) => (
        <PermissionGate module="leads" action="edit">
          <Tooltip title={lead.isHot ? "Remove Hot" : "Mark as Hot"}>
            <Button
              type="text"
              icon={lead.isHot ? <FireFilled className="text-orange-500" /> : <FireOutlined />}
              onClick={(event) => {
                event.stopPropagation();
                onToggleHot(lead);
              }}
            />
          </Tooltip>
        </PermissionGate>
      ),
    },
  ];

  return (
    <Table
      rowKey="_id"
      loading={isLoading}
      dataSource={leads}
      columns={columns}
      onRow={(lead) => ({
        onClick: (event) => {
          // AntD portals dropdown/picker popups to <body>, outside the row's
          // DOM — clicking an option or the DatePicker's "OK" button still
          // bubbles here. Skip navigation when the click actually landed in
          // one of those popups rather than on the row itself.
          if (event.target.closest(".ant-select-dropdown, .ant-picker-dropdown, .ant-dropdown")) {
            return;
          }
          navigate(`/leads/${lead._id}`);
        },
        className: "cursor-pointer",
      })}
      pagination={{ pageSize: 20 }}
    />
  );
}

export default LeadsTable;
