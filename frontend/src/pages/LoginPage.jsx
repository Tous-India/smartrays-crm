import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Form, Input, Button, Alert } from "antd";
import useSessionStore from "../store/sessionStore";
import { ROUTE_PATHS } from "../constants/routePaths.constants";
import AuthLayout from "../components/AuthLayout";
import TwoFactorChallenge from "../modules/auth/components/TwoFactorChallenge";
import {
  AUTH_LABEL_CLASS,
  AUTH_LINK_CLASS,
  AUTH_SUBTITLE_CLASS,
  AUTH_TITLE_CLASS,
} from "../constants/authStyles.constants";

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
  //
  // No white card wrapper any more: the form panel is already opaque, so the
  // challenge renders straight onto it like every other auth step.
  if (challenge) {
    return (
      <AuthLayout>
        <TwoFactorChallenge
          preAuthToken={challenge.preAuthToken}
          onVerified={handleVerified}
          onRestart={() => setChallenge(null)}
        />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <h1 className={AUTH_TITLE_CLASS}>Welcome back</h1>
      <p className={AUTH_SUBTITLE_CLASS}>Sign in to your account to continue</p>

      {errorMessage && (
        <Alert type="error" message={errorMessage} showIcon className="!mt-6" data-testid="login-error" />
      )}

      {/*
        `disabled={isSubmitting}` stays. It is the double-submit guard, and it
        is also what makes the button genuinely disabled during a request —
        see the `auth-submit-button` note in index.css (§7.59).

        `requiredMark={false}` drops AntD's red asterisks only; the `required`
        rules below still validate.
      */}
      <Form
        layout="vertical"
        onFinish={handleSubmit}
        disabled={isSubmitting}
        requiredMark={false}
        className="app-compact-form !mt-6"
      >
        <Form.Item
          label={<span className={AUTH_LABEL_CLASS}>Email</span>}
          name="email"
          rules={[{ required: true, message: "Email is required" }]}
        >
          <Input type="email" autoComplete="email" size="large" placeholder="you@example.com" />
        </Form.Item>

        <Form.Item
          label={<span className={AUTH_LABEL_CLASS}>Password</span>}
          name="password"
          rules={[{ required: true, message: "Password is required" }]}
        >
          <Input.Password autoComplete="current-password" size="large" placeholder="••••••••" />
        </Form.Item>

        <Form.Item className="!mb-0">
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

      {/* Below the button, not floating above the field it belongs to. */}
      <div className="mt-4 text-center">
        <Link to={ROUTE_PATHS.FORGOT_PASSWORD} className={AUTH_LINK_CLASS}>
          Forgot password?
        </Link>
      </div>
    </AuthLayout>
  );
}

export default LoginPage;
