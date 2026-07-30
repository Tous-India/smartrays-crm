import { useMemo, useState } from "react";
import { Button, Segmented, Result, message } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import PermissionGate from "../../../routes/PermissionGate";
import { usePermission } from "../../../hooks/usePermission";
import useUserDirectory from "../../../hooks/useUserDirectory";
import usePayments from "../hooks/usePayments";
import useCustomerDirectory from "../hooks/useCustomerDirectory";
import { createPayment } from "../api/paymentApi";
import { PAYMENT_DATE_FILTER_OPTIONS, computePaymentDateRange } from "../utils/paymentDateFilters";
import PaymentsTable from "./PaymentsTable";
import RecordPaymentModal from "./RecordPaymentModal";

const PAGE_SIZE = 20;

/**
 * `/payments` — admin-only (§5's matrix: `payments.view`/`create` are "–"
 * for every other role, no ownership scoping at all). `usePermission` + a
 * 403 `Result` gates the whole page, the same pattern `AttendanceTeamPage`
 * already uses; `PermissionGate` alone additionally gates the "Record
 * Payment" button for `payments.create` specifically, since `view` and
 * `create` are separate grants.
 */
function PaymentsListPage() {
  const canView = usePermission("payments", "view");
  const [activeFilter, setActiveFilter] = useState("today");
  const [page, setPage] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { users } = useUserDirectory();
  const { customers } = useCustomerDirectory();

  const dateRange = computePaymentDateRange(activeFilter);
  const filters = { ...dateRange, page, limit: PAGE_SIZE };

  const { payments, total, isLoading, refetch } = usePayments(filters, { enabled: canView });

  const userNameById = useMemo(() => new Map(users.map((user) => [user._id, user.name])), [users]);
  const customerNameById = useMemo(
    () => new Map(customers.map((customer) => [customer._id, customer.companyName])),
    [customers]
  );

  function handleFilterChange(key) {
    setActiveFilter(key);
    setPage(1);
  }

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

  if (!canView) {
    return <Result status="403" title="Not authorized" subTitle="You do not have permission to view payments." />;
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <Segmented
          value={activeFilter}
          onChange={handleFilterChange}
          options={PAYMENT_DATE_FILTER_OPTIONS.map((option) => ({ value: option.key, label: option.label }))}
        />

        <PermissionGate module="payments" action="create">
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsModalOpen(true)}>
            Record Payment
          </Button>
        </PermissionGate>
      </div>

      <PaymentsTable
        payments={payments}
        isLoading={isLoading}
        total={total}
        page={page}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
        customerNameById={customerNameById}
        userNameById={userNameById}
      />

      <RecordPaymentModal
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        onSubmit={handleRecordPayment}
        isSubmitting={isSubmitting}
        users={users}
      />
    </div>
  );
}

export default PaymentsListPage;
