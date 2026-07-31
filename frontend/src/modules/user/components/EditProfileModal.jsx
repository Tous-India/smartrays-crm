import { useEffect, useState } from "react";
import { Modal, Form, Input, App } from "antd";
import { updateUser } from "../api/userApi";
import useSessionStore from "../../../store/sessionStore";

/**
 * Lets the CURRENTLY LOGGED-IN user edit their own name/email/phone — no new
 * backend work. Reuses the existing `PATCH /users/:id`
 * (`user.service.js#updateUser`), which already restricts a self-edit to
 * exactly these three fields server-side (role/managerId/isActive/
 * baseSalary stay admin-only, enforced at both the validation and service
 * layers, §7.0b) — this modal just doesn't render fields the backend
 * wouldn't accept from a self-edit anyway, rather than showing them and
 * having the request 400. Unlike `UserFormModal` (an admin editing SOMEONE
 * ELSE, with role/manager/salary), this is deliberately a separate, smaller
 * component for the self-edit case.
 *
 * On success, calls `refetchSession()` so the sidebar/top-bar's displayed
 * name updates immediately without a re-login — the same "no cache to bust"
 * reasoning §4.1 already relies on elsewhere.
 */
function EditProfileModal({ open, onClose }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const user = useSessionStore((state) => state.user);
  const refetchSession = useSessionStore((state) => state.refetchSession);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open && user) {
      form.setFieldsValue({ name: user.name, email: user.email, phone: user.phone });
    }
  }, [open, user, form]);

  async function handleOk() {
    const values = await form.validateFields();
    setIsSubmitting(true);
    try {
      await updateUser(user._id, values);
      await refetchSession();
      message.success("Profile updated");
      onClose();
    } catch (error) {
      message.error(error.response?.data?.message || "Failed to update profile");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleCancel() {
    form.resetFields();
    onClose();
  }

  return (
    <Modal
      title="Edit Profile"
      open={open}
      onOk={handleOk}
      onCancel={handleCancel}
      confirmLoading={isSubmitting}
      destroyOnHidden
    >
      <Form form={form} layout="vertical">
        <Form.Item label="Name" name="name" rules={[{ required: true, message: "Name is required" }]}>
          <Input />
        </Form.Item>

        <Form.Item
          label="Email"
          name="email"
          rules={[{ required: true, type: "email", message: "A valid email is required" }]}
        >
          <Input type="email" />
        </Form.Item>

        <Form.Item label="Phone" name="phone">
          <Input />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default EditProfileModal;
