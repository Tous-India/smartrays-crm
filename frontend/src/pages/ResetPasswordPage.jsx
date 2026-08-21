import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Form, Input, Button, Alert } from "antd";
import { resetPasswordRequest } from "../modules/auth/api";
import { ROUTE_PATHS } from "../constants/routePaths.constants";
import AuthLayout from "../components/AuthLayout";
import {
  AUTH_LABEL_CLASS,
  AUTH_LINK_CLASS,
  AUTH_SUBTITLE_CLASS,
  AUTH_TITLE_CLASS,
} from "../constants/authStyles.constants";

function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const navigate = useNavigate();
  const [errorMessage, setErrorMessage] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDone, setIsDone] = useState(false);

  async function handleSubmit(values) {
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      await resetPasswordRequest({ token, newPassword: values.newPassword });
      setIsDone(true);
    } catch (error) {
      const message =
        error.response?.data?.message || "This password reset link is invalid or has expired.";
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!token) {
    return (
      <AuthLayout>
        <Alert
          type="error"
          showIcon
          message="This password reset link is missing its token."
          data-testid="reset-password-missing-token"
        />
        <div className="mt-4 text-center">
          <Link to={ROUTE_PATHS.FORGOT_PASSWORD} className={AUTH_LINK_CLASS}>
            Request a new reset link
          </Link>
        </div>
      </AuthLayout>
    );
  }

  if (isDone) {
    return (
      <AuthLayout>
        <h1 className={AUTH_TITLE_CLASS}>Password reset</h1>
        <p className={AUTH_SUBTITLE_CLASS} data-testid="reset-password-success">
          Your password has been reset successfully. You can now log in with your new password.
        </p>
        <Button
          type="primary"
          size="large"
          block
          className="auth-submit-button !mt-7"
          onClick={() => navigate(ROUTE_PATHS.LOGIN, { replace: true })}
        >
          Go to login
        </Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <h1 className={AUTH_TITLE_CLASS}>Reset your password</h1>
      <p className={AUTH_SUBTITLE_CLASS}>Choose a new password for your account.</p>

      {errorMessage && (
        <Alert
          type="error"
          message={errorMessage}
          showIcon
          className="app-compact-form !mt-6"
          data-testid="reset-password-error"
        />
      )}

      <Form
        layout="vertical"
        onFinish={handleSubmit}
        disabled={isSubmitting}
        requiredMark={false}
        className="app-compact-form !mt-6"
      >
        <Form.Item
          label={<span className={AUTH_LABEL_CLASS}>New password</span>}
          name="newPassword"
          rules={[
            { required: true, message: "New password is required" },
            { min: 8, message: "Password must be at least 8 characters" },
          ]}
        >
          <Input.Password autoComplete="new-password" size="large" placeholder="••••••••" />
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
            Reset password
          </Button>
        </Form.Item>
      </Form>

      <div className="mt-4 text-center">
        <Link to={ROUTE_PATHS.LOGIN} className={AUTH_LINK_CLASS}>
          Back to login
        </Link>
      </div>
    </AuthLayout>
  );
}

export default ResetPasswordPage;
