import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Form, Input, Button, Alert, Typography } from "antd";
import { resetPasswordRequest } from "../modules/auth/api";
import { ROUTE_PATHS } from "../constants/routePaths.constants";
import AuthLayout from "../components/AuthLayout";
import { FROSTED_INPUT_STYLE } from "../constants/authStyles.constants";

const { Title, Text } = Typography;

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
        <div className="!mt-6 text-center">
          <Link to={ROUTE_PATHS.FORGOT_PASSWORD} className="!text-sm !text-white/70 hover:!text-white">
            Request a new reset link
          </Link>
        </div>
      </AuthLayout>
    );
  }

  if (isDone) {
    return (
      <AuthLayout>
        <Title level={3} className="!mb-1 !text-white !tracking-tight">
          Password reset
        </Title>
        <Text className="!text-white/60" data-testid="reset-password-success">
          Your password has been reset successfully. You can now log in with your new password.
        </Text>
        <Button
          type="primary"
          size="large"
          block
          className="!mt-6"
          onClick={() => navigate(ROUTE_PATHS.LOGIN, { replace: true })}
        >
          Go to login
        </Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <Title level={3} className="!mb-1 !text-white !tracking-tight">
        Reset your password
      </Title>
      <Text className="!text-white/60">Choose a new password for your account.</Text>

      {errorMessage && (
        <Alert
          type="error"
          message={errorMessage}
          showIcon
          className="!mt-6"
          data-testid="reset-password-error"
        />
      )}

      <Form layout="vertical" onFinish={handleSubmit} disabled={isSubmitting} className="!mt-6">
        <Form.Item
          label={<span className="!text-white/85">New password</span>}
          name="newPassword"
          rules={[
            { required: true, message: "New password is required" },
            { min: 8, message: "Password must be at least 8 characters" },
          ]}
        >
          <Input.Password
            autoComplete="new-password"
            size="large"
            style={FROSTED_INPUT_STYLE}
            className="auth-frosted-input"
          />
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
    </AuthLayout>
  );
}

export default ResetPasswordPage;
