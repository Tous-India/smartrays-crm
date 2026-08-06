import { useState } from "react";
import { Alert, Button, Checkbox, Form, Input, Typography } from "antd";
import { verifyTwoFactor } from "../twoFactorApi";

const { Title, Paragraph } = Typography;

/**
 * The second step of login (§7.38, 2026-08-05) — no session exists yet, only
 * a 5-minute pre-auth token.
 *
 * The same field accepts a TOTP code or a recovery code; the backend decides
 * which it is. That's deliberate — asking someone locked out of their phone
 * to first find the right tab, then paste a code, is friction at exactly the
 * worst moment.
 *
 * A 429 means the attempt is locked and the whole login must restart, so it
 * surfaces its own "start again" action rather than leaving the user typing
 * into a form that can no longer succeed.
 */
function TwoFactorChallenge({ preAuthToken, onVerified, onRestart }) {
  const [error, setError] = useState(null);
  const [isLocked, setIsLocked] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(values) {
    setError(null);
    setIsSubmitting(true);

    try {
      await verifyTwoFactor(preAuthToken, values.token, values.rememberDevice === true);
      await onVerified();
    } catch (verifyError) {
      const status = verifyError.response?.status;
      setError(verifyError.response?.data?.message || "That code isn't valid.");

      // 429 means the attempt is spent: further codes, even correct ones,
      // are refused until the login restarts from the password.
      setIsLocked(status === 429);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div data-testid="two-factor-challenge">
      <Title level={4}>Enter your verification code</Title>
      <Paragraph type="secondary">
        Open your authenticator app and enter the 6-digit code. You can also use one of your
        recovery codes.
      </Paragraph>

      {error && <Alert type="error" showIcon className="!mb-4" message={error} data-testid="two-factor-error" />}

      {isLocked ? (
        <Button type="primary" block onClick={onRestart}>
          Start again
        </Button>
      ) : (
        <Form layout="vertical" onFinish={handleSubmit}>
          <Form.Item
            label="Verification or recovery code"
            name="token"
            rules={[{ required: true, message: "Enter your code" }]}
          >
            <Input autoFocus autoComplete="one-time-code" />
          </Form.Item>

          {/*
            §7.40 — opt-in, and unchecked by default. Ticking it means this
            browser skips the CODE next time, never the password; the wording
            says so explicitly rather than the usual vague "keep me signed
            in", which invites people to assume more than it does.
          */}
          <Form.Item name="rememberDevice" valuePropName="checked" initialValue={false}>
            <Checkbox data-testid="remember-device">
              Remember this device for 30 days
              <div className="text-xs text-gray-500">
                Skip the code on this browser next time. You&apos;ll still enter your password.
              </div>
            </Checkbox>
          </Form.Item>

          <Button type="primary" htmlType="submit" block loading={isSubmitting}>
            Verify
          </Button>
        </Form>
      )}
    </div>
  );
}

export default TwoFactorChallenge;
