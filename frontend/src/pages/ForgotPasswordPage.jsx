import { useState } from "react";
import { Link } from "react-router-dom";
import { Form, Input, Button, Typography } from "antd";
import { forgotPasswordRequest } from "../modules/auth/api";
import { ROUTE_PATHS } from "../constants/routePaths.constants";
import AuthLayout from "../components/AuthLayout";
import { FROSTED_INPUT_STYLE } from "../constants/authStyles.constants";

const { Title, Text } = Typography;

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
      <Title level={3} className="!mb-1 !text-white !tracking-tight">
        Forgot your password?
      </Title>
      <Text className="!text-white/60">
        Enter your account email and we&apos;ll send you a link to reset it.
      </Text>

      {hasSubmitted ? (
        <Text className="!mt-6 block !text-white/85" data-testid="forgot-password-success">
          If an account with that email exists, a reset link has been sent. Please check your inbox.
        </Text>
      ) : (
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

          <Form.Item className="!mb-0">
            <Button type="primary" htmlType="submit" loading={isSubmitting} size="large" block>
              Send reset link
            </Button>
          </Form.Item>
        </Form>
      )}

      <div className="!mt-6 text-center">
        <Link to={ROUTE_PATHS.LOGIN} className="!text-sm !text-white/70 hover:!text-white">
          Back to login
        </Link>
      </div>
    </AuthLayout>
  );
}

export default ForgotPasswordPage;
