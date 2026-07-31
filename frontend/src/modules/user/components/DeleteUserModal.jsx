import { Modal, Form, Input } from "antd";

/**
 * A dedicated modal (not a bare `Popconfirm`), matching
 * `payment/components/DeletePaymentModal.jsx`'s exact pattern — this is a
 * permanent, unrecoverable action, so it needs a typed reason and explicit
 * warning text, not just a yes/no confirmation.
 */
function DeleteUserModal({ open, user, onCancel, onSubmit, isSubmitting }) {
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
      title="Delete User"
      open={open}
      onOk={handleOk}
      onCancel={handleCancel}
      confirmLoading={isSubmitting}
      okText="Delete"
      okButtonProps={{ danger: true }}
      destroyOnHidden
    >
      <p className="mb-3">
        This permanently deletes {user?.name}. Their name will no longer resolve in past records
        (leads, attendance, payments, etc.) — this cannot be undone.
      </p>

      <Form form={form} layout="vertical">
        <Form.Item
          label="Reason for deletion"
          name="reason"
          rules={[{ required: true, message: "A reason is required to permanently delete a user" }]}
        >
          <Input.TextArea rows={2} placeholder="Why is this user being permanently deleted?" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default DeleteUserModal;
