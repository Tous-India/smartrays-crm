import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Alert, Button, Form, Input, Typography, Spin, Checkbox } from "antd";
import { startEnrolment, confirmEnrolment } from "../twoFactorApi";

const { Title, Text, Paragraph } = Typography;

/**
 * TOTP enrolment (§7.38, 2026-08-05) — QR plus the manual key, a verify step
 * before 2FA is actually switched on, and the one-time recovery codes.
 *
 * Reused by BOTH entry points: the blocking gate an admin/manager hits at
 * login (holding only a pre-auth token) and voluntary enrolment from
 * Settings (holding a session). `preAuthToken` decides which credential the
 * API calls carry; everything else is identical, so there is one enrolment
 * implementation rather than two that could drift.
 *
 * The QR is rendered client-side from the `otpauth://` URI — the secret is
 * never sent to a third-party chart service, which is exactly the sort of
 * thing that quietly leaks a 2FA secret.
 *
 * Recovery codes are shown ONCE and gated behind an explicit "I've saved
 * these" checkbox. That confirmation is the point: these codes are the only
 * way back in if the authenticator is lost, and they cannot be retrieved
 * afterwards.
 */
function TwoFactorEnrolment({ preAuthToken, onEnrolled, title = "Set up two-factor authentication" }) {
  const [enrolment, setEnrolment] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [recoveryCodes, setRecoveryCodes] = useState(null);
  const [hasSavedCodes, setHasSavedCodes] = useState(false);
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    startEnrolment(preAuthToken)
      .then(async (response) => {
        if (cancelled) return;

        setEnrolment(response.data.data);
        setQrDataUrl(await QRCode.toDataURL(response.data.data.otpauthUrl));
      })
      .catch((startError) => {
        if (!cancelled) {
          setError(startError.response?.data?.message || "Could not start enrolment. Please try again.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [preAuthToken]);

  async function handleConfirm(values) {
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await confirmEnrolment(values.token, preAuthToken);
      setRecoveryCodes(response.data.data.recoveryCodes);
    } catch (confirmError) {
      setError(confirmError.response?.data?.message || "That code isn't valid. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (recoveryCodes) {
    return (
      <div data-testid="recovery-codes-step">
        <Title level={4}>Save your recovery codes</Title>
        <Alert
          type="warning"
          showIcon
          className="!mb-4"
          message="This is the only time these are shown"
          description="Each code works once. They're the only way into your account if you lose your authenticator app — store them somewhere safe and offline."
        />

        <div className="mb-4 grid grid-cols-2 gap-2 rounded-md border bg-gray-50 p-4 font-mono text-sm">
          {recoveryCodes.map((code) => (
            <div key={code}>{code}</div>
          ))}
        </div>

        <Checkbox
          checked={hasSavedCodes}
          onChange={(event) => setHasSavedCodes(event.target.checked)}
          className="mb-4"
        >
          I&apos;ve saved these codes somewhere safe
        </Checkbox>

        <Button type="primary" block disabled={!hasSavedCodes} onClick={onEnrolled}>
          Continue
        </Button>
      </div>
    );
  }

  return (
    <div data-testid="enrolment-step">
      <Title level={4}>{title}</Title>
      <Paragraph type="secondary">
        Scan this with an authenticator app (Google Authenticator, 1Password, Authy), then enter the
        6-digit code it shows.
      </Paragraph>

      {error && <Alert type="error" showIcon className="!mb-4" message={error} />}

      {!enrolment ? (
        <div className="flex justify-center py-6">
          <Spin />
        </div>
      ) : (
        <>
          {qrDataUrl && (
            <div className="mb-3 flex justify-center">
              <img src={qrDataUrl} alt="Two-factor QR code" width={180} height={180} />
            </div>
          )}

          {/* The manual key matters — plenty of desktop authenticators can't
              scan a QR, and a QR-only flow would strand those users. */}
          <Paragraph type="secondary" className="!mb-4 text-center text-xs">
            Can&apos;t scan? Enter this key manually:
            <br />
            <Text code copyable data-testid="manual-key">
              {enrolment.secret}
            </Text>
          </Paragraph>

          <Form layout="vertical" onFinish={handleConfirm}>
            <Form.Item
              label="6-digit code"
              name="token"
              rules={[{ required: true, message: "Enter the code from your app" }]}
            >
              <Input autoComplete="one-time-code" inputMode="numeric" maxLength={6} />
            </Form.Item>
            <Button type="primary" htmlType="submit" block loading={isSubmitting}>
              Verify and enable
            </Button>
          </Form>
        </>
      )}
    </div>
  );
}

export default TwoFactorEnrolment;
