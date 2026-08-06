import { useState } from "react";
import { Card, Form, Input, Button, Alert, Typography, Avatar, App } from "antd";
import { UserOutlined } from "@ant-design/icons";
import useSessionStore from "../store/sessionStore";
import { updateMyProfile } from "../modules/user/api/selfApi";

const { Text } = Typography;

/**
 * `/profile` (§7.39, 2026-08-05) — the employee's own details.
 *
 * Photo is always editable. Name and phone only when their manager has
 * granted `canEditOwnProfile`; otherwise they render as read-only text with
 * NO enabled input, rather than an input that looks editable and then fails
 * on save. Email is always read-only — it identifies the account and the
 * server rejects it outright.
 *
 * The server enforces all of this independently; this is the honest UI for
 * rules that live in `user.service.js#updateOwnProfile`, not the enforcement.
 */
function EmployeeProfilePage() {
  const { message } = App.useApp();
  const user = useSessionStore((state) => state.user);
  const refresh = useSessionStore((state) => state.completeTwoFactor);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);

  const canEdit = Boolean(user?.canEditOwnProfile);

  async function handleSubmit(values) {
    setError(null);
    setIsSaving(true);

    try {
      // Only ever send what the server allows for THIS user — sending a
      // gated field without the grant is refused outright, not ignored.
      const payload = { photo: values.photo || null };

      if (canEdit) {
        payload.name = values.name;
        payload.phone = values.phone;
      }

      await updateMyProfile(payload);
      await refresh();
      message.success("Profile updated");
    } catch (saveError) {
      setError(saveError.response?.data?.message || "Could not update your profile.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card title="My profile" className="app-elevated-card">
      {error && <Alert type="error" showIcon className="!mb-4" message={error} />}

      {!canEdit && (
        <Alert
          type="info"
          showIcon
          className="!mb-4"
          message="Your name and phone are managed by your manager"
          description="You can still change your photo. Ask your manager if these details need updating."
        />
      )}

      <div className="mb-4 flex items-center gap-3">
        <Avatar size={64} src={user?.photo || undefined} icon={<UserOutlined />} />
        <div>
          <div className="font-medium">{user?.name}</div>
          <Text type="secondary" className="text-xs">
            {user?.role}
          </Text>
        </div>
      </div>

      <Form
        layout="vertical"
        className="max-w-md"
        initialValues={{ name: user?.name, phone: user?.phone, photo: user?.photo }}
        onFinish={handleSubmit}
      >
        <Form.Item label="Photo URL" name="photo">
          <Input placeholder="https://..." />
        </Form.Item>

        {canEdit ? (
          <>
            <Form.Item label="Name" name="name" rules={[{ required: true, message: "Name is required" }]}>
              <Input />
            </Form.Item>
            <Form.Item label="Phone" name="phone">
              <Input />
            </Form.Item>
          </>
        ) : (
          <>
            <Form.Item label="Name">
              <Text data-testid="readonly-name">{user?.name || "—"}</Text>
            </Form.Item>
            <Form.Item label="Phone">
              <Text data-testid="readonly-phone">{user?.phone || "—"}</Text>
            </Form.Item>
          </>
        )}

        {/* Email identifies the account; the server refuses to change it here
            under any condition, so it is never rendered as an input. */}
        <Form.Item label="Email">
          <Text data-testid="readonly-email">{user?.email}</Text>
        </Form.Item>

        <Button type="primary" htmlType="submit" loading={isSaving}>
          Save changes
        </Button>
      </Form>
    </Card>
  );
}

export default EmployeeProfilePage;
