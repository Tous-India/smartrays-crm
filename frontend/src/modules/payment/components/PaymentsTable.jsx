import { Table, Space, Tooltip, Button } from "antd";
import { EditOutlined, DeleteOutlined, HistoryOutlined } from "@ant-design/icons";
import PermissionGate from "../../../routes/PermissionGate";
import { formatPaymentDate, formatPaymentAmount } from "../utils/paymentFormat";

/**
 * `GET /payments` returns bare Payment documents (no populate) — `customerId`
 * and `recordedBy` are resolved to display names via the same Map-lookup
 * convention already used for "Owner" elsewhere (CustomersTable.jsx et al.),
 * not a backend join.
 *
 * `className="app-data-table"` (styles/index.css) — the same row-density +
 * card-border/shadow treatment LeadsTable.jsx uses, generalized from a
 * Leads-only class into a shared one for this table to reuse rather than
 * duplicating the same CSS under a second name.
 */
function PaymentsTable({
  payments,
  isLoading,
  total,
  page,
  pageSize,
  onPageChange,
  customerNameById,
  userNameById,
  onEdit,
  onDelete,
  onViewHistory,
}) {
  const columns = [
    {
      title: "Date",
      dataIndex: "date",
      render: formatPaymentDate,
    },
    {
      title: "Customer",
      key: "customer",
      render: (_, payment) =>
        payment.customerId ? customerNameById.get(payment.customerId) || "—" : payment.manualClientName || "—",
    },
    {
      title: "Contact",
      dataIndex: "contactName",
      // The name snapshotted at write time (§7.70), not a lookup: contact
      // deletion is a hard delete, and this page has no contact directory
      // to look one up in anyway. A payment with no contact shows a dash.
      render: (value) => value || "—",
    },
    {
      title: "Amount",
      dataIndex: "amount",
      render: formatPaymentAmount,
    },
    {
      title: "Notes",
      dataIndex: "notes",
      render: (value) => value || "—",
    },
    {
      title: "Recorded By",
      dataIndex: "recordedBy",
      render: (recordedBy) => userNameById.get(recordedBy) || "—",
    },
    {
      title: "Collected By",
      dataIndex: "collectedBy",
      render: (collectedBy) => (collectedBy ? userNameById.get(collectedBy) || "—" : "—"),
    },
    {
      title: "Actions",
      key: "actions",
      render: (_, payment) => (
        <Space size={0}>
          <Tooltip title="View History">
            <Button
              type="text"
              icon={<HistoryOutlined />}
              aria-label="View History"
              onClick={() => onViewHistory(payment)}
            />
          </Tooltip>
          <PermissionGate module="payments" action="edit">
            <Tooltip title="Edit Payment">
              <Button type="text" icon={<EditOutlined />} aria-label="Edit Payment" onClick={() => onEdit(payment)} />
            </Tooltip>
          </PermissionGate>
          <PermissionGate module="payments" action="delete">
            <Tooltip title="Delete Payment">
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                aria-label="Delete Payment"
                onClick={() => onDelete(payment)}
              />
            </Tooltip>
          </PermissionGate>
        </Space>
      ),
    },
  ];

  return (
    <Table
      rowKey="_id"
      className="app-data-table"
      loading={isLoading}
      dataSource={payments}
      columns={columns}
      pagination={{
        current: page,
        pageSize,
        total,
        onChange: onPageChange,
      }}
      scroll={{ x: "max-content" }}
      // See LeadsTable.jsx's own comment — `sticky` keeps the horizontal
      // scrollbar reachable at the viewport's bottom edge instead of only
      // at the table's own, and `offsetHeader` matches the fixed app
      // header's `.app-topbar-height` (48px) so the table's own sticky
      // header doesn't slide underneath it.
      sticky={{ offsetHeader: 48 }}
    />
  );
}

export default PaymentsTable;
