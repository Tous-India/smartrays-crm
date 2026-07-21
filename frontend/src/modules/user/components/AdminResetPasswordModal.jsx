import { useEffect, useState } from "react";
import { Modal, Form, Input, Typography, Alert } from "antd";
import { adminResetPassword } from "../api/userApi";

const { Text, Paragraph } = Typography;

/**
 * Admin override for a user's password (§7.17) — separate from the
 * self-service forgot/reset-password flow. Two modes in one form: leave
 * "New password" blank to have the backend generate a one-time temp
 * password (shown once, here, after submit — never persisted anywhere
 * else), or type an exact password to set it directly.
 */
function AdminResetPasswordModal({ open, targetUser, onCancel }) {
  const [form] = Form.useForm();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tempPassword, setTempPassword] = useState(null);

  useEffect(() => {
    if (open) {
      form.resetFields();
      setTempPassword(null);
    }
  }, [open, form]);

  async function handleOk() {
    if (tempPassword !== null) {
      // Already showed the result — this click just closes out.
      handleClose();
      return;
    }

    const values = await form.validateFields();
    setIsSubmitting(true);

    try {
      const response = await adminResetPassword(targetUser._id, {
        newPassword: values.newPassword || undefined,
      });
      setTempPassword(response.data.data.tempPassword || "(the password you entered was set)");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleClose() {
    form.resetFields();
    setTempPassword(null);
    onCancel();
  }

  return (
    <Modal
      title={`Reset password — ${targetUser?.name || ""}`}
      open={open}
      onOk={handleOk}
      onCancel={handleClose}
      confirmLoading={isSubmitting}
      okText={tempPassword !== null ? "Done" : "Reset password"}
      destroyOnHidden
    >
      {tempPassword !== null ? (
        <Alert
          type="success"
          showIcon
          message="Password reset"
          description={
            <div data-testid="admin-reset-result">
              <Paragraph className="!mb-1">
                Share this temporary password with the user securely — it will not be shown
                again:
              </Paragraph>
              <Text code copyable>
                {tempPassword}
              </Text>
            </div>
          }
        />
      ) : (
        <Form form={form} layout="vertical">
          <Form.Item
            label="New password"
            name="newPassword"
            rules={[{ min: 8, message: "Password must be at least 8 characters" }]}
            extra="Leave blank to auto-generate a one-time temporary password instead."
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
        </Form>
      )}
    </Modal>
  );
}

export default AdminResetPasswordModal;
