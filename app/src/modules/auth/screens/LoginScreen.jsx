import { useRef, useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import Config from "react-native-config";
import Screen from "../../../components/Screen";
import BrandHeader from "../../../components/BrandHeader";
import TextField from "../../../components/TextField";
import PrimaryButton from "../../../components/PrimaryButton";
import ErrorBanner from "../../../components/ErrorBanner";
import LinkText from "../../../components/LinkText";
import { SCREENS } from "../../../constants/screens.constants";
import { signIn } from "../session.service";
import { validateLoginForm } from "../../../utils/validation.utils";
import { messageFromError } from "../../../utils/apiError.utils";
import { spacing, typography } from "../../../theme";

/**
 * Sign in (app-plan.md §1.0) — email + password against POST /auth/mobile/
 * login. Field errors are the client's, the banner is whatever the server
 * said, verbatim. When the account has a second factor outstanding, the
 * screen hands the pre-auth token to the code step; otherwise the session
 * service signs in and the root navigator switches stacks on its own.
 *
 * Forgot password stays on the web (app-plan.md §1.0): the link opens the
 * web app's reset page in the browser when WEB_APP_URL is configured.
 */
function LoginScreen({ navigation }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [errorMessage, setErrorMessage] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const passwordRef = useRef(null);

  async function handleSubmit() {
    // The double-submit guard: the button is disabled while a request is in
    // flight, and this catches a second call that arrives anyway (the
    // keyboard's "done" key fires independently of the button).
    if (isSubmitting) {
      return;
    }

    const errors = validateLoginForm({ email, password });
    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) {
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const result = await signIn(email, password);

      if (result.requiresTwoFactor) {
        navigation.navigate(SCREENS.TWO_FACTOR, {
          preAuthToken: result.preAuthToken,
          email: result.email,
        });
      }
    } catch (error) {
      setErrorMessage(messageFromError(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleForgotPassword() {
    if (Config.WEB_APP_URL) {
      Linking.openURL(`${Config.WEB_APP_URL}/forgot-password`);
    }
  }

  return (
    <Screen centered testID="login-screen">
      <BrandHeader />
      <Text style={typography.title}>Welcome back</Text>
      <Text style={[typography.subtitle, styles.subtitle]}>Sign in to your account to continue</Text>

      <ErrorBanner message={errorMessage} testID="login-error" />

      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        error={fieldErrors.email}
        placeholder="you@example.com"
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
        editable={!isSubmitting}
        testID="login-email"
      />
      <TextField
        ref={passwordRef}
        label="Password"
        value={password}
        onChangeText={setPassword}
        error={fieldErrors.password}
        placeholder="••••••••"
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="done"
        onSubmitEditing={handleSubmit}
        editable={!isSubmitting}
        testID="login-password"
      />

      <PrimaryButton title="Log in" onPress={handleSubmit} loading={isSubmitting} testID="login-submit" />

      <View style={styles.footer}>
        <LinkText title="Forgot password?" onPress={handleForgotPassword} testID="login-forgot" />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  subtitle: { marginTop: spacing.xs + 2, marginBottom: spacing.xl },
  footer: { marginTop: spacing.lg, alignItems: "center" },
});

export default LoginScreen;
