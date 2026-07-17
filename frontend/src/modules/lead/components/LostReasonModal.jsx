import { Modal, Form, Input } from "antd";

/**
 * Backend requires `lostReason` whenever `status` is set to `lost`
 * (`lead.validation.js#validateStatusChangeInput`) — this collects it BEFORE
 * the status-change call is made, whether the trigger was a board drag or a
 * detail-page "Lost" button, so the API call never fails silently after a
 * drag has already visually "succeeded".
 */
function LostReasonModal({ open, leadName, onCancel, onConfirm, isSubmitting }) {
  const [form] = Form.useForm();

  async function handleOk() {
    const values = await form.validateFields();
    await onConfirm(values.lostReason);
    form.resetFields();
  }

  function handleCancel() {
    form.resetFields();
    onCancel();
  }

  return (
    <Modal
      title={`Mark "${leadName}" as Lost`}
      open={open}
      onOk={handleOk}
      onCancel={handleCancel}
      confirmLoading={isSubmitting}
      okText="Mark as Lost"
      okButtonProps={{ danger: true }}
    >
      <Form form={form} layout="vertical">
        <Form.Item
          label="Reason"
          name="lostReason"
          rules={[{ required: true, message: "A reason is required to mark a lead as lost" }]}
        >
          <Input.TextArea rows={3} placeholder="Why was this lead lost?" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default LostReasonModal;
