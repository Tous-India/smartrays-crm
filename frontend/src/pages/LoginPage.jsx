import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Form, Input, Button, Alert, Typography } from "antd";
import useSessionStore from "../store/sessionStore";
import { ROUTE_PATHS } from "../constants/routePaths.constants";
import AuthLayout from "../components/AuthLayout";
import { FROSTED_INPUT_STYLE } from "../constants/authStyles.constants";

const { Title, Text } = Typography;

function LoginPage() {
  const login = useSessionStore((state) => state.login);
  const navigate = useNavigate();
  const [errorMessage, setErrorMessage] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(values) {
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      await login(values.email, values.password);
      navigate(ROUTE_PATHS.ROOT, { replace: true });
    } catch (error) {
      const message = error.response?.data?.message || "Login failed. Please try again.";
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthLayout>
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
          <Button type="primary" htmlType="submit" loading={isSubmitting} size="large" block>
            Log in
          </Button>
        </Form.Item>
      </Form>
    </AuthLayout>
  );
}

export default LoginPage;
