import { useEffect } from "react";
import { Modal, Form, Input, Select, InputNumber } from "antd";
import useUserDirectory from "../../../hooks/useUserDirectory";
import { USER_ROLES, USER_ROLE_LABELS } from "../constants/user.constants";

/**
 * Shared create/edit form for the User Management screen. Create posts to
 * the existing admin-gated `POST /auth/register` (no separate `POST /users`
 * — matches the backend's single account-creation path, see
 * backend/README.md's Auth section); edit uses the existing
 * `PATCH /users/:id`, which already allows an admin to set `role`/
 * `managerId`/`baseSalary` alongside `name`/`email`/`phone` — no new backend
 * endpoint needed for either mode.
 */
function UserFormModal({ open, mode, initialUser, onCancel, onSubmit, isSubmitting }) {
  const [form] = Form.useForm();
  const { users } = useUserDirectory();

  // A manager must be role "manager" or "admin" (enforced server-side too,
  // user.service.js#ensureValidManagerId) — narrow the picker to match so an
  // admin isn't offered a choice the backend will just reject.
  const managerOptions = users
    .filter((user) => user.role === "manager" || user.role === "admin")
    .map((user) => ({ value: user._id, label: user.name }));

  useEffect(() => {
    if (open) {
      form.setFieldsValue(mode === "edit" && initialUser ? { ...initialUser } : {});
    }
  }, [open, mode, initialUser, form]);

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
      title={mode === "edit" ? "Edit User" : "New User"}
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

        {mode === "create" && (
          <Form.Item
            label="Password"
            name="password"
            rules={[
              { required: true, message: "Password is required" },
              { min: 8, message: "Password must be at least 8 characters" },
            ]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
        )}

        <Form.Item label="Role" name="role" rules={[{ required: true, message: "Role is required" }]}>
          <Select
            options={USER_ROLES.map((role) => ({ value: role, label: USER_ROLE_LABELS[role] }))}
          />
        </Form.Item>

        <Form.Item label="Manager" name="managerId">
          <Select allowClear placeholder="No manager" options={managerOptions} showSearch optionFilterProp="label" />
        </Form.Item>

        <Form.Item label="Base Salary" name="baseSalary">
          <InputNumber min={0} style={{ width: "100%" }} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default UserFormModal;
