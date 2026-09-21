import { useMemo, useState } from "react";
import { Card, Table, Button, App } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import PermissionGate from "../../../routes/PermissionGate";
import useUserDirectory from "../../../hooks/useUserDirectory";
import useCustomerPayments from "../hooks/useCustomerPayments";
import { createPayment } from "../../payment/api/paymentApi";
import RecordPaymentModal from "../../payment/components/RecordPaymentModal";
import { formatPaymentDate, formatPaymentAmount } from "../../payment/utils/paymentFormat";

/**
 * Payments section on the Customer Detail Page (§7.70) — this customer's
 * own cash log, and the second entry point for recording one.
 *
 * READING is gated where the data is: `GET /customers/:id/payments` needs
 * `customers.view`, so anyone who can open this page sees the list.
 * RECORDING still goes through `POST /payments`, which needs
 * `payments.create` — admin-tier by template — so the button is gated on
 * that, not on the page's own permission. A viewer who can see the customer
 * but not record money sees the history and no button.
 *
 * The modal is `RecordPaymentModal` in FIXED-CUSTOMER mode: the customer is
 * this page's, so it is rendered as a label rather than the search picker,
 * and the Contact options are the page's already-loaded `contacts`.
 *
 * `useUserDirectory` is fetched HERE because this page did not load users
 * before — it is needed both for the Collected By column and for the modal's
 * Collected By default, which must not be set until the list has resolved.
 */
function CustomerPaymentsSection({ customer, contacts }) {
  const { message } = App.useApp();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { users } = useUserDirectory();
  const { payments, isLoading, refetch } = useCustomerPayments(customer._id);

  const userNameById = useMemo(() => new Map(users.map((user) => [user._id, user.name])), [users]);
  const contactNameById = useMemo(() => new Map(contacts.map((contact) => [contact._id, contact.name])), [contacts]);

  async function handleRecordPayment(payload) {
    setIsSubmitting(true);

    try {
      await createPayment(payload);
      message.success("Payment recorded");
      setIsModalOpen(false);
      refetch();
    } finally {
      setIsSubmitting(false);
    }
  }

  const columns = [
    {
      title: "Date",
      dataIndex: "date",
      render: formatPaymentDate,
    },
    {
      title: "Contact",
      key: "contact",
      // Live name while the contact still exists (a corrected spelling
      // should show), the write-time snapshot once it is gone. Contact
      // deletion is a hard delete, so the snapshot is the only thing that
      // survives it.
      render: (_, payment) => contactNameById.get(payment.contactId) || payment.contactName || "—",
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
      title: "Collected By",
      dataIndex: "collectedBy",
      render: (collectedBy) => (collectedBy ? userNameById.get(collectedBy) || "—" : "—"),
    },
  ];

  return (
    <Card
      title="Payments"
      className="mb-6 app-elevated-card"
      data-testid="customer-payments-section"
      extra={
        <PermissionGate module="payments" action="create">
          <Button size="small" icon={<PlusOutlined />} onClick={() => setIsModalOpen(true)}>
            Record Payment
          </Button>
        </PermissionGate>
      }
    >
      <Table
        rowKey="_id"
        size="small"
        loading={isLoading}
        dataSource={payments}
        columns={columns}
        pagination={false}
        locale={{ emptyText: "No payments recorded yet" }}
        scroll={{ x: "max-content" }}
      />

      <RecordPaymentModal
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        onSubmit={handleRecordPayment}
        isSubmitting={isSubmitting}
        users={users}
        fixedCustomer={customer}
        fixedCustomerContacts={contacts}
      />
    </Card>
  );
}

export default CustomerPaymentsSection;
