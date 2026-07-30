import { Modal, Form, Input } from "antd";

/**
 * A small dedicated modal rather than a bare `Popconfirm` — deleting a
 * payment needs a typed reason, not just a yes/no confirmation, so it
 * needs its own form field to require and validate.
 */
function DeletePaymentModal({ open, payment, onCancel, onSubmit, isSubmitting }) {
  const [form] = Form.useForm();

  async function handleOk() {
    let values;

    try {
      values = await form.validateFields();
    } catch {
      return;
    }

    await onSubmit(values.reason);
    form.resetFields();
  }

  function handleCancel() {
    form.resetFields();
    onCancel();
  }

  return (
    <Modal
      title="Delete Payment"
      open={open}
      onOk={handleOk}
      onCancel={handleCancel}
      confirmLoading={isSubmitting}
      okText="Delete"
      okButtonProps={{ danger: true }}
      destroyOnHidden
    >
      <p className="mb-3">
        This removes the payment{payment ? ` of ₹${payment.amount?.toLocaleString()}` : ""} from the
        Payments list and totals. It isn't permanently erased — an admin can still view it in the
        audit log.
      </p>

      <Form form={form} layout="vertical">
        <Form.Item
          label="Reason for deletion"
          name="reason"
          rules={[{ required: true, message: "A reason is required to delete a payment" }]}
        >
          <Input.TextArea rows={2} placeholder="Why is this payment being deleted?" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default DeletePaymentModal;
