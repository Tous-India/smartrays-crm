import { useState } from "react";
import { Link } from "react-router-dom";
import { Form, Input, Button } from "antd";
import { forgotPasswordRequest } from "../modules/auth/api";
import { ROUTE_PATHS } from "../constants/routePaths.constants";
import AuthLayout from "../components/AuthLayout";
import {
  AUTH_LABEL_CLASS,
  AUTH_LINK_CLASS,
  AUTH_SUBTITLE_CLASS,
  AUTH_TITLE_CLASS,
} from "../constants/authStyles.constants";

function ForgotPasswordPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  async function handleSubmit(values) {
    setIsSubmitting(true);

    try {
      await forgotPasswordRequest({ email: values.email });
    } catch {
      // Deliberately swallowed — the backend's response is generic
      // (never reveals whether the email matched an account) and even a
      // network-level failure here must not surface differently, or the
      // UI itself would become an oracle for account enumeration.
    } finally {
      setHasSubmitted(true);
      setIsSubmitting(false);
    }
  }

  return (
    <AuthLayout>
      <h1 className={AUTH_TITLE_CLASS}>Forgot your password?</h1>
      <p className={AUTH_SUBTITLE_CLASS}>
        Enter your account email and we&apos;ll send you a link to reset it.
      </p>

      {hasSubmitted ? (
        <p className="mt-6 text-sm leading-relaxed text-slate-700" data-testid="forgot-password-success">
          If an account with that email exists, a reset link has been sent. Please check your inbox.
        </p>
      ) : (
        <Form
          layout="vertical"
          onFinish={handleSubmit}
          disabled={isSubmitting}
          requiredMark={false}
          className="!mt-7"
        >
          <Form.Item
            label={<span className={AUTH_LABEL_CLASS}>Email</span>}
            name="email"
            rules={[{ required: true, message: "Email is required" }]}
          >
            <Input type="email" autoComplete="email" size="large" placeholder="you@example.com" />
          </Form.Item>

          <Form.Item className="!mb-0">
            {/* `auth-submit-button` — see LoginPage.jsx / index.css. */}
            <Button
              type="primary"
              htmlType="submit"
              loading={isSubmitting}
              size="large"
              block
              className="auth-submit-button"
            >
              Send reset link
            </Button>
          </Form.Item>
        </Form>
      )}

      <div className="mt-5 text-center">
        <Link to={ROUTE_PATHS.LOGIN} className={AUTH_LINK_CLASS}>
          Back to login
        </Link>
      </div>
    </AuthLayout>
  );
}

export default ForgotPasswordPage;
