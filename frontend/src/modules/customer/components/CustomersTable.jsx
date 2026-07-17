import { Table, Tag, Space, Button, Popconfirm } from "antd";
import { useNavigate } from "react-router-dom";
import PermissionGate from "../../../routes/PermissionGate";
import {
  CUSTOMER_STATUS_COLORS,
  CUSTOMER_STATUS_LABELS,
  CONTRACT_TYPE_COLORS,
  CONTRACT_TYPE_LABELS,
} from "../constants/customer.constants";

/**
 * List View table per leads-customer-functional-spec.md: Company Name,
 * Owner, Type badges (derived from contracts — see useCustomers.js),
 * Source, Signed Up (sortable), Status columns; checkbox row selection +
 * bulk Mark Active/Mark Inactive/Delete, shown as a toolbar above the table
 * once at least one row is selected (Select All is antd Table's own
 * built-in header checkbox — no separate control needed for that).
 */
function CustomersTable({
  customers,
  isLoading,
  users,
  selectedRowKeys,
  onSelectionChange,
  onBulkAction,
  isBulkActing,
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
        loading={isLoading}
        dataSource={customers}
        columns={columns}
        rowSelection={{
          selectedRowKeys,
          onChange: onSelectionChange,
        }}
        pagination={{ pageSize: 20 }}
      />
    </div>
  );
}

export default CustomersTable;
