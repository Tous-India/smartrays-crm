import { useEffect } from "react";
import { Modal, Form, InputNumber, DatePicker, Input, Select } from "antd";
import dayjs from "dayjs";

/**
 * Edit is scoped to amount/date/notes/collectedBy only — customerId/
 * manualClientName/invoiceId (the payment's reconciliation identity, §7.9/
 * §11.3) are NOT editable here, matching the backend's own
 * `updatePayment` (payment.service.js), which silently ignores those
 * fields rather than allowing a payment to be re-pointed at a different
 * client/invoice after the fact. "Reason for edit" is required — enforced
 * both here (can't even submit without it) and again server-side.
 */
function EditPaymentModal({ open, payment, onCancel, onSubmit, isSubmitting, users }) {
  const [form] = Form.useForm();

  useEffect(() => {
    if (open && payment) {
      form.setFieldsValue({
        amount: payment.amount,
        date: payment.date ? dayjs(payment.date) : null,
        notes: payment.notes,
        collectedBy: payment.collectedBy,
        reason: undefined,
      });
    }
  }, [open, payment, form]);

  async function handleOk() {
    let values;

    try {
      values = await form.validateFields();
    } catch {
      return;
    }

    await onSubmit({
      amount: values.amount,
      date: values.date.toISOString(),
      notes: values.notes,
      collectedBy: values.collectedBy,
      reason: values.reason,
    });

    form.resetFields();
  }

  function handleCancel() {
    form.resetFields();
    onCancel();
  }

  const userOptions = users.map((user) => ({ value: user._id, label: user.name }));

  return (
    <Modal
      title="Edit Payment"
      open={open}
      onOk={handleOk}
      onCancel={handleCancel}
      confirmLoading={isSubmitting}
      okText="Save"
      destroyOnHidden
    >
      <Form form={form} layout="vertical">
        <Form.Item label="Amount" name="amount" rules={[{ required: true, message: "Amount is required" }]}>
          <InputNumber min={0} style={{ width: "100%" }} prefix="₹" />
        </Form.Item>

        <Form.Item label="Date" name="date" rules={[{ required: true, message: "Date is required" }]}>
          <DatePicker showTime={{ format: "HH:mm" }} format="YYYY-MM-DD HH:mm" style={{ width: "100%" }} />
        </Form.Item>

        <Form.Item label="Notes" name="notes">
          <Input.TextArea rows={2} />
        </Form.Item>

        <Form.Item label="Collected By" name="collectedBy">
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            options={userOptions}
            placeholder="Who physically collected this payment? (optional)"
          />
        </Form.Item>

        <Form.Item
          label="Reason for edit"
          name="reason"
          rules={[{ required: true, message: "A reason is required to edit a payment" }]}
        >
          <Input.TextArea rows={2} placeholder="Why is this payment being edited?" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default EditPaymentModal;
