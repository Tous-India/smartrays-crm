import { useRef, useState } from "react";
import { Modal, Form, Select, InputNumber, DatePicker, Input } from "antd";
import dayjs from "dayjs";
import { listCustomers } from "../../customer/api/customerApi";

const SEARCH_DEBOUNCE_MS = 300;

/**
 * Customer picker is a debounced search-as-you-type `Select` against the
 * existing `GET /customers?search=` endpoint (`listCustomers`) — no new
 * backend endpoint, per this task's own instruction to reuse what already
 * exists. Every other searchable picker in this codebase (`LeadFormModal`'s
 * Owner, `ConvertToCustomerModal`'s Project Manager) filters a fully-
 * fetched-once list client-side instead; that pattern doesn't fit here
 * since the whole point is not fetching every Customer up front.
 *
 * Scope note (explicit, per this task): system customers only —
 * `manualClientName` (non-system/cash entries) and invoice-linking
 * (reconciling against an outstanding Invoice) are backend-supported but
 * deliberately left out of this first version.
 */
function RecordPaymentModal({ open, onCancel, onSubmit, isSubmitting }) {
  const [form] = Form.useForm();
  const [customerOptions, setCustomerOptions] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const debounceRef = useRef(null);

  function handleCustomerSearch(value) {
    clearTimeout(debounceRef.current);

    if (!value || !value.trim()) {
      setCustomerOptions([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const response = await listCustomers({ search: value });
        setCustomerOptions(
          response.data.data.map((customer) => ({ value: customer._id, label: customer.companyName }))
        );
      } finally {
        setIsSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);
  }

  async function handleOk() {
    let values;

    try {
      values = await form.validateFields();
    } catch {
      // AntD's Form already renders the per-field errors inline.
      return;
    }

    await onSubmit({
      customerId: values.customerId,
      amount: values.amount,
      date: values.date.toISOString(),
      notes: values.notes,
    });

    form.resetFields();
    setCustomerOptions([]);
  }

  function handleCancel() {
    form.resetFields();
    setCustomerOptions([]);
    onCancel();
  }

  return (
    <Modal
      title="Record Payment"
      open={open}
      onOk={handleOk}
      onCancel={handleCancel}
      confirmLoading={isSubmitting}
      okText="Save"
      destroyOnHidden
    >
      <Form form={form} layout="vertical" initialValues={{ date: dayjs() }}>
        <Form.Item label="Customer" name="customerId" rules={[{ required: true, message: "Select a customer" }]}>
          <Select
            showSearch
            filterOption={false}
            onSearch={handleCustomerSearch}
            loading={isSearching}
            options={customerOptions}
            placeholder="Search customer by company name…"
            notFoundContent={isSearching ? "Searching…" : "Type to search"}
          />
        </Form.Item>

        <Form.Item label="Amount" name="amount" rules={[{ required: true, message: "Amount is required" }]}>
          <InputNumber min={0} style={{ width: "100%" }} prefix="₹" />
        </Form.Item>

        <Form.Item label="Date" name="date" rules={[{ required: true, message: "Date is required" }]}>
          {/* Hours:minutes only — same `showTime` config as LeadFormModal's
              own follow-up date field; the default `showTime` also asks for
              seconds, precision a payment record doesn't need either. */}
          <DatePicker showTime={{ format: "HH:mm" }} format="YYYY-MM-DD HH:mm" style={{ width: "100%" }} />
        </Form.Item>

        <Form.Item label="Notes" name="notes">
          <Input.TextArea rows={2} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default RecordPaymentModal;
