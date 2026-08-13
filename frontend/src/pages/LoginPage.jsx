import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Form, Input, Button, Alert, Typography } from "antd";
import useSessionStore from "../store/sessionStore";
import { ROUTE_PATHS } from "../constants/routePaths.constants";
import AuthLayout from "../components/AuthLayout";
import TwoFactorChallenge from "../modules/auth/components/TwoFactorChallenge";
import { FROSTED_INPUT_STYLE } from "../constants/authStyles.constants";

const { Title, Text } = Typography;

function LoginPage() {
  const login = useSessionStore((state) => state.login);
  const completeTwoFactor = useSessionStore((state) => state.completeTwoFactor);
  const navigate = useNavigate();
  const [errorMessage, setErrorMessage] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // §7.38 — the pre-auth token lives in component state only, for the few
  // seconds between password and second factor. Never persisted: it is
  // deliberately not a cookie, so nothing should give it a longer life.
  const [challenge, setChallenge] = useState(null);

  async function handleSubmit(values) {
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const result = await login(values.email, values.password);

      if (result?.preAuthToken) {
        setChallenge(result);
        return;
      }

      navigate(ROUTE_PATHS.ROOT, { replace: true });
    } catch (error) {
      const message = error.response?.data?.message || "Login failed. Please try again.";
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleVerified() {
    await completeTwoFactor();
    navigate(ROUTE_PATHS.ROOT, { replace: true });
  }

  // A second factor is outstanding. There is no session yet, and this screen
  // cannot be skipped.
  //
  // The blocking ENROLMENT variant that used to sit alongside this — shown to
  // an admin/manager who had never enrolled — was removed 2026-08-08 with the
  // mandate. Nobody is forced into enrolment at login any more; 2FA is turned
  // on from Settings → Account by choice.
  if (challenge) {
    return (
      <AuthLayout background="photo">
        <div className="rounded-lg bg-white p-6">
          <TwoFactorChallenge
            preAuthToken={challenge.preAuthToken}
            onVerified={handleVerified}
            onRestart={() => setChallenge(null)}
          />
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout background="photo">
      <Title level={3} className="!mb-1 !text-white !tracking-tight">
        Welcome back
      </Title>
      <Text className="!text-white/60">Sign in to your account to continue</Text>

      {errorMessage && (
        <Alert type="error" message={errorMessage} showIcon className="!mt-6" data-testid="login-error" />
      )}

      <Form layout="vertical" onFinish={handleSubmit} disabled={isSubmitting} className="!mt-6">
        <Form.Item
          label={<span className="!text-white/85">Email</span>}
          name="email"
          rules={[{ required: true, message: "Email is required" }]}
        >
          <Input
            type="email"
            autoComplete="email"
            size="large"
            style={FROSTED_INPUT_STYLE}
            className="auth-frosted-input"
          />
        </Form.Item>

        <Form.Item
          label={<span className="!text-white/85">Password</span>}
          name="password"
          rules={[{ required: true, message: "Password is required" }]}
        >
          <Input.Password
            autoComplete="current-password"
            size="large"
            style={FROSTED_INPUT_STYLE}
            className="auth-frosted-input"
          />
        </Form.Item>

        <div className="!-mt-2 !mb-4 flex justify-end">
          <Link to={ROUTE_PATHS.FORGOT_PASSWORD} className="!text-sm !text-white/70 hover:!text-white">
            Forgot password?
          </Link>
        </div>

        <Form.Item className="!mb-0">
          {/*
            `auth-submit-button` (index.css) keeps this legible while the login
            request is in flight. The Form's `disabled={isSubmitting}` above
            makes this button genuinely disabled, and AntD's disabled tokens
            composite into the frosted card until it is invisible. The disabled
            state itself is kept — it is the double-submit guard.
          */}
          <Button
            type="primary"
            htmlType="submit"
            loading={isSubmitting}
            size="large"
            block
            className="auth-submit-button"
          >
            Log in
          </Button>
        </Form.Item>
      </Form>
    </AuthLayout>
  );
}

export default LoginPage;
