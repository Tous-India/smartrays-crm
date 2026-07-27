import { Table, Tag, Select, Button, Tooltip, Space, Popconfirm, message } from "antd";
import { FireOutlined, FireFilled, PhoneOutlined, CopyOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import LeadStatusSelect from "./LeadStatusSelect";
import LeadFollowUpCell from "./LeadFollowUpCell";
import PermissionGate from "../../../routes/PermissionGate";
import { LEAD_STATUS_COLORS, LEAD_STATUS_LABELS, CLIENT_TYPE_LABELS } from "../constants/lead.constants";

function isOverdue(followUpDate) {
  return followUpDate && new Date(followUpDate) < new Date();
}

/**
 * Table View per leads-customer-functional-spec.md: Contact (name + phone),
 * Company, Status, Source, Owner, Follow-up, Budget, Created columns; status
 * changes via an inline dropdown; overdue follow-ups highlighted red. Row
 * actions (hot toggle, assign owner, quick call-log) are quick actions
 * available without opening the detail slide-over, per the spec's "Quick
 * Actions (from list/board)". Checkbox row selection + a bulk-action toolbar
 * (shown once at least one row is selected) mirror the identical pattern
 * already established in `CustomersTable.jsx`.
 */
function LeadsTable({
  leads,
  isLoading,
  users,
  canEdit,
  canReassignOwner,
  canDelete,
  onRequestStatusChange,
  onToggleHot,
  onAssignOwner,
  onRescheduleFollowUp,
  onLogCall,
  selectedRowKeys,
  onSelectionChange,
  onBulkAssignOwner,
  onBulkDelete,
  isBulkActing,
}) {
  const navigate = useNavigate();

  const userNameById = new Map(users.map((user) => [user._id, user.name]));

  function handleCopyPhone(event, phone) {
    event.stopPropagation();
    // `writeText` rejects (e.g. `NotAllowedError` when the document isn't
    // focused) — handled explicitly rather than left as an uncaught
    // rejection, same reasoning as LeadFormModal's `validateFields` fix.
    navigator.clipboard
      .writeText(phone)
      .then(() => message.success("Phone number copied"))
      .catch(() => message.error("Couldn't copy — please copy it manually"));
  }

  const columns = [
    {
      title: "Contact",
      dataIndex: "name",
      render: (name, lead) => (
        <div>
          {/* No hot-fire icon here — the Actions column's toggle already
              shows it (orange when hot, grey outline when not); showing it
              a second time next to the name was a duplicate, per this
              task's own instruction. */}
          <span className="flex items-center gap-1">{name}</span>
          {lead.phone && (
            <span className="flex items-center gap-1 text-xs text-gray-500">
              {lead.phone}
              <Tooltip title="Copy phone number">
                <Button
                  type="text"
                  size="small"
                  icon={<CopyOutlined />}
                  onClick={(event) => handleCopyPhone(event, lead.phone)}
                />
              </Tooltip>
            </span>
          )}
        </div>
      ),
    },
    {
      title: "Company",
      dataIndex: "companyName",
      className: "leads-company-cell",
      render: (value) => value || "—",
    },
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
          <Space size={0}>
            <Tooltip title="Log Call">
              <Button
                type="text"
                icon={<PhoneOutlined />}
                onClick={(event) => {
                  event.stopPropagation();
                  onLogCall(lead);
                }}
              />
            </Tooltip>
            <Tooltip title={lead.isHot ? "Remove Hot" : "Mark as Hot"}>
              {/* Inline `style`, not a Tailwind className — AntD's `Button`
                  sets its own icon color via injected CSS that a plain
                  utility class loses to (same fix as LeadDetailContent.jsx's
                  hot-toggle button). */}
              <Button
                type="text"
                icon={
                  lead.isHot ? (
                    <FireFilled style={{ color: "#fa8c16" }} />
                  ) : (
                    <FireOutlined style={{ color: "#bfbfbf" }} />
                  )
                }
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleHot(lead);
                }}
              />
            </Tooltip>
          </Space>
        </PermissionGate>
      ),
    },
  ];

  return (
    <div>
      {selectedRowKeys.length > 0 && (
        <div className="mb-3 flex items-center gap-3 rounded-md bg-brand-navy/5 px-4 py-2  ">
          <span>{selectedRowKeys.length} selected</span>
          {canReassignOwner && (
            <Select
              size="small"
              placeholder="Assign owner…"
              style={{ minWidth: 160 }}
              options={users.map((user) => ({ value: user._id, label: user.name }))}
              disabled={isBulkActing}
              onChange={onBulkAssignOwner}
            />
          )}
          {canDelete && (
            <Popconfirm
              title={`Delete ${selectedRowKeys.length} lead(s)?`}
              okText="Delete"
              okType="danger"
              onConfirm={onBulkDelete}
            >
              <Button size="small" danger loading={isBulkActing}>
                Delete
              </Button>
            </Popconfirm>
          )}
        </div>
      )}

      <Table
        rowKey="_id"
        className="leads-table"
        loading={isLoading}
        dataSource={leads}
        columns={columns}
        rowSelection={{
          selectedRowKeys,
          onChange: onSelectionChange,
        }}
        onRow={(lead) => ({
          onClick: (event) => {
            // AntD portals dropdown/picker popups to <body>, outside the row's
            // DOM — clicking an option or the DatePicker's "OK" button still
            // bubbles here. Skip navigation when the click actually landed in
            // one of those popups rather than on the row itself.
            if (
              event.target.closest(
                ".ant-select-dropdown, .ant-picker-dropdown, .ant-dropdown, .ant-popover"
              )
            ) {
              return;
            }
            navigate(`/leads/${lead._id}`);
          },
          className: "cursor-pointer",
        })}
        pagination={{ pageSize: 20 }}
      />
    </div>
  );
}

export default LeadsTable;
