import { useEffect } from "react";
import { Modal, Form, Input } from "antd";

/**
 * Add/edit a credential. `password` is required on create
 * (`customer.validation.js#validateCredentialInput`) but optional on edit —
 * an edit that doesn't touch the password field leaves it unchanged
 * server-side (`customer.service.js#updateCredential` only re-encrypts if
 * `payload.password !== undefined`). Never pre-fills the password field on
 * edit — the plaintext isn't known client-side unless it was just revealed,
 * and this form isn't where reveal happens (see
 * CustomerCredentialsSection.jsx), so leaving it blank on edit is the only
 * honest option.
 */
function CredentialFormModal({ open, mode, initialCredential, onCancel, onSubmit, isSubmitting }) {
  const [form] = Form.useForm();

  useEffect(() => {
    if (open) {
      form.setFieldsValue(
        mode === "edit" && initialCredential
          ? { ...initialCredential, password: undefined }
          : {}
      );
    }
  }, [open, mode, initialCredential, form]);

  async function handleOk() {
    const values = await form.validateFields();
    onSubmit(values);
  }

  function handleCancel() {
    form.resetFields();
    onCancel();
  }

  return (
    <Modal
      title={mode === "edit" ? "Edit Credential" : "Add Credential"}
      open={open}
      onOk={handleOk}
      onCancel={handleCancel}
      confirmLoading={isSubmitting}
      destroyOnHidden
    >
      <Form form={form} layout="vertical">
        <Form.Item label="Service" name="service" rules={[{ required: true, message: "Service is required" }]}>
          <Input placeholder='e.g. "Hosting", "Domain", "Meta Ads"' />
        </Form.Item>
        <Form.Item label="Username" name="username">
          <Input />
        </Form.Item>
        <Form.Item
          label="Password"
          name="password"
          rules={mode === "create" ? [{ required: true, message: "Password is required" }] : []}
          extra={mode === "edit" ? "Leave blank to keep the current password unchanged." : undefined}
        >
          <Input.Password />
        </Form.Item>
        <Form.Item label="URL" name="url">
          <Input />
        </Form.Item>
        <Form.Item label="Notes" name="notes">
          <Input.TextArea rows={2} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default CredentialFormModal;
