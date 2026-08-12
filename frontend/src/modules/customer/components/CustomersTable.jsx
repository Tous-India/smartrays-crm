import { Table, Tag, Space, Button, Popconfirm } from "antd";
import { useNavigate } from "react-router-dom";
import PermissionGate from "../../../routes/PermissionGate";
import CopyablePhoneCell from "../../../components/CopyablePhoneCell";
import CustomerStatusToggleButton from "./CustomerStatusToggleButton";
import {
  CUSTOMER_STATUS_COLORS,
  CUSTOMER_STATUS_LABELS,
  CONTRACT_TYPE_COLORS,
  CONTRACT_TYPE_LABELS,
} from "../constants/customer.constants";

/**
 * List View table per leads-customer-functional-spec.md: Company Name,
 * Contact, Owner, Type badges (derived from contracts — see
 * useCustomers.js), Source, Signed Up (sortable), Status columns; checkbox
 * row selection + bulk Mark Active/Mark Inactive/Delete, shown as a toolbar
 * above the table once at least one row is selected (Select All is antd
 * Table's own built-in header checkbox — no separate control needed for
 * that).
 *
 * **Contact column** — each customer's primary contact (`Contact.isPrimary:
 * true`), name on top + phone below with the same copy-to-clipboard button
 * as `LeadsTable.jsx`'s own Contact column (`CopyablePhoneCell`, extracted
 * from that table so both reuse the identical behavior). `customer.
 * primaryContact` comes pre-attached in the `GET /customers` list response
 * (`customer.service.js#attachPrimaryContacts`) — one extra query for the
 * whole page, not one per row, the same N+1 mistake already fixed on Leads.
 * `null` (no contact flagged primary, or no contacts at all) renders as
 * "—", not a broken/empty layout.
 *
 * **Actions column** — a per-row `CustomerStatusToggleButton`, the exact
 * same component (and thus the exact same `PATCH /customers/:id` call and
 * Popconfirm consequence text) the Customer Detail header already uses, so
 * this doesn't duplicate that logic. `onChanged` refetches the list so the
 * row's Status/Actions reflect the change immediately, no full page reload.
 */
function CustomersTable({
  customers,
  isLoading,
  users,
  selectedRowKeys,
  onSelectionChange,
  onBulkAction,
  isBulkActing,
  onChanged,
}) {
  const navigate = useNavigate();
  const userNameById = new Map(users.map((user) => [user._id, user.name]));

  const columns = [
    {
      title: "Company Name",
      dataIndex: "companyName",
      // A dedicated link, not a whole-row onClick — this table also has
      // checkbox row selection and a sortable column, and a full-row click
      // handler fights with both (checkbox clicks bubbling into navigation).
      render: (companyName, customer) => (
        <a onClick={() => navigate(`/customers/${customer._id}`)}>{companyName}</a>
      ),
    },
    {
      title: "Contact",
      key: "contact",
      render: (_, customer) => {
        if (!customer.primaryContact) {
          return "—";
        }

        return (
          <div>
            <span className="flex items-center gap-1">{customer.primaryContact.name}</span>
            <CopyablePhoneCell phone={customer.primaryContact.phone} />
          </div>
        );
      },
    },
    {
      title: "Owner",
      dataIndex: "ownerId",
      render: (ownerId) => userNameById.get(ownerId) || "—",
    },
    {
      title: "Type",
      dataIndex: "contractTypes",
      render: (contractTypes) =>
        contractTypes && contractTypes.length > 0 ? (
          <Space size={4} wrap>
            {contractTypes.map((type) => (
              <Tag key={type} color={CONTRACT_TYPE_COLORS[type]}>
                {CONTRACT_TYPE_LABELS[type]}
              </Tag>
            ))}
          </Space>
        ) : (
          "—"
        ),
    },
    { title: "Source", dataIndex: "source", render: (value) => value || "—" },
    {
      title: "Signed Up",
      dataIndex: "signedUpAt",
      sorter: (a, b) => new Date(a.signedUpAt) - new Date(b.signedUpAt),
      render: (value) => (value ? new Date(value).toLocaleDateString() : "—"),
    },
    {
      title: "Status",
      dataIndex: "customerStatus",
      render: (status) => <Tag color={CUSTOMER_STATUS_COLORS[status]}>{CUSTOMER_STATUS_LABELS[status]}</Tag>,
    },
    {
      title: "Actions",
      key: "actions",
      render: (_, customer) => (
        <PermissionGate module="customers" action="edit">
          <CustomerStatusToggleButton customer={customer} onChanged={onChanged} size="small" />
        </PermissionGate>
      ),
    },
  ];

  return (
    <div>
      {selectedRowKeys.length > 0 && (
        <div className="mb-3 flex items-center gap-3 rounded-md bg-brand-navy/5 px-4 py-2">
          <span>{selectedRowKeys.length} selected</span>
          <PermissionGate module="customers" action="edit">
            <Button size="small" loading={isBulkActing} onClick={() => onBulkAction("activate")}>
              Mark Active
            </Button>
          </PermissionGate>
          <PermissionGate module="customers" action="edit">
            <Button size="small" loading={isBulkActing} onClick={() => onBulkAction("deactivate")}>
              Mark Inactive
            </Button>
          </PermissionGate>
          <PermissionGate module="customers" action="delete">
            <Popconfirm
              title={`Delete ${selectedRowKeys.length} customer(s)?`}
              okText="Delete"
              okType="danger"
              onConfirm={() => onBulkAction("delete")}
            >
              <Button size="small" danger loading={isBulkActing}>
                Delete
              </Button>
            </Popconfirm>
          </PermissionGate>
        </div>
      )}

      <Table
        rowKey="_id"
        // Missing here before (2026-07-31 fix) — Leads/Payments both already
        // have this (row density + card separation + the sticky-scrollbar
        // pastel-blue styling, styles/index.css), confirmed via a live
        // check that this table's own sticky scrollbar was still rendering
        // AntD's plain grey default, not an intentional omission.
        className="app-data-table"
        loading={isLoading}
        dataSource={customers}
        columns={columns}
        rowSelection={{
          selectedRowKeys,
          onChange: onSelectionChange,
        }}
        pagination={{ pageSize: 20 }}
        scroll={{ x: "max-content" }}
        // See LeadsTable.jsx's own comment — `sticky` keeps the horizontal
        // scrollbar reachable at the viewport's bottom edge instead of only
        // at the table's own, and `offsetHeader` matches the fixed app
        // header's `.app-topbar-height` (48px) so the table's own sticky
        // header doesn't slide underneath it.
        sticky={{ offsetHeader: 48 }}
      />
    </div>
  );
}

export default CustomersTable;
