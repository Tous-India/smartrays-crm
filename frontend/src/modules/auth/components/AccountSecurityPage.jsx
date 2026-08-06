import { useState } from "react";
import { Alert, Button, Card, Form, Input, Modal, Tag, Typography, App } from "antd";
import { SafetyCertificateOutlined } from "@ant-design/icons";
import useSessionStore from "../../../store/sessionStore";
import TwoFactorEnrolment from "./TwoFactorEnrolment";
import { changePassword, regenerateRecoveryCodes } from "../twoFactorApi";
import { isTwoFactorMandatory } from "../../../utils/twoFactor.utils";

const { Title, Paragraph, Text } = Typography;

/**
 * Settings → Account (§7.38, 2026-08-05): two-factor status and enrolment,
 * recovery-code regeneration, and password change.
 *
 * Deliberately NO "reset password by email" link. Production SMTP points at a
 * placeholder host, so `/auth/forgot-password` returns 500 — offering it here
 * would send people down a path that cannot work. The signed-out
 * `/forgot-password` page still exists and is untouched; this is about not
 * advertising a broken route to someone who is already signed in and can
 * simply change their password directly.
 */
function AccountSecurityPage() {
  const { message } = App.useApp();
  const user = useSessionStore((state) => state.user);
  const refreshUser = useSessionStore((state) => state.completeTwoFactor);

  const [isEnrolling, setIsEnrolling] = useState(false);
  const [newCodes, setNewCodes] = useState(null);
  const [isChanging, setIsChanging] = useState(false);
  const [passwordError, setPasswordError] = useState(null);
  const [form] = Form.useForm();

  const mandatory = isTwoFactorMandatory(user?.role);

  async function handleChangePassword(values) {
    setPasswordError(null);
    setIsChanging(true);

    try {
      await changePassword(values);
      message.success("Password changed");
      form.resetFields();
    } catch (error) {
      setPasswordError(error.response?.data?.message || "Could not change your password.");
    } finally {
      setIsChanging(false);
    }
  }

  async function handleRegenerate() {
    try {
      const response = await regenerateRecoveryCodes();
      setNewCodes(response.data.data.recoveryCodes);
    } catch (error) {
      message.error(error.response?.data?.message || "Could not generate new codes.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card title="Two-factor authentication" className="app-elevated-card">
        <div className="mb-3 flex items-center gap-2">
          <SafetyCertificateOutlined />
          {user?.twoFactorEnabled ? (
            <Tag color="green">Enabled</Tag>
          ) : (
            <Tag color={mandatory ? "red" : "default"}>Not enabled</Tag>
          )}
          {mandatory && (
            <Text type="secondary" className="text-xs">
              Required for your role
            </Text>
          )}
        </div>

        {user?.twoFactorEnabled ? (
          <>
            <Paragraph type="secondary">
              You&apos;ll be asked for a code from your authenticator app each time you sign in.
            </Paragraph>
            <Button onClick={handleRegenerate}>Generate new recovery codes</Button>
            <Paragraph type="secondary" className="!mt-2 text-xs">
              Generating a new set immediately invalidates your existing codes.
            </Paragraph>
          </>
        ) : (
          <>
            <Paragraph type="secondary">
              Add a second step to sign-in so a stolen password isn&apos;t enough on its own.
            </Paragraph>
            <Button type="primary" onClick={() => setIsEnrolling(true)}>
              Set up two-factor authentication
            </Button>
          </>
        )}
      </Card>

      <Card title="Change password" className="app-elevated-card">
        {passwordError && <Alert type="error" showIcon className="!mb-4" message={passwordError} />}

        <Form form={form} layout="vertical" onFinish={handleChangePassword} className="max-w-md">
          <Form.Item
            label="Current password"
            name="currentPassword"
            rules={[{ required: true, message: "Enter your current password" }]}
          >
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Form.Item
            label="New password"
            name="newPassword"
            rules={[
              { required: true, message: "Enter a new password" },
              { min: 8, message: "Must be at least 8 characters" },
            ]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={isChanging}>
            Change password
          </Button>
        </Form>
      </Card>

      <Modal
        title="Two-factor authentication"
        open={isEnrolling}
        onCancel={() => setIsEnrolling(false)}
        footer={null}
        destroyOnHidden
      >
        <TwoFactorEnrolment
          onEnrolled={async () => {
            setIsEnrolling(false);
            await refreshUser();
            message.success("Two-factor authentication enabled");
          }}
        />
      </Modal>

      <Modal
        title="Your new recovery codes"
        open={Boolean(newCodes)}
        onCancel={() => setNewCodes(null)}
        onOk={() => setNewCodes(null)}
        okText="I've saved these"
        destroyOnHidden
      >
        <Alert
          type="warning"
          showIcon
          className="!mb-3"
          message="Shown only once"
          description="Your previous codes no longer work."
        />
        <div className="grid grid-cols-2 gap-2 rounded-md border bg-gray-50 p-4 font-mono text-sm">
          {(newCodes || []).map((code) => (
            <div key={code}>{code}</div>
          ))}
        </div>
      </Modal>
    </div>
  );
}

export default AccountSecurityPage;
