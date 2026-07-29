import { Table } from "antd";

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
function PaymentsTable({ payments, isLoading, total, page, pageSize, onPageChange, customerNameById, userNameById }) {
  const columns = [
    {
      title: "Date",
      dataIndex: "date",
      render: (value) => new Date(value).toLocaleDateString(),
    },
    {
      title: "Customer",
      key: "customer",
      render: (_, payment) =>
        payment.customerId ? customerNameById.get(payment.customerId) || "—" : payment.manualClientName || "—",
    },
    {
      title: "Amount",
      dataIndex: "amount",
      render: (value) => `₹${value.toLocaleString()}`,
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
    />
  );
}

export default PaymentsTable;
