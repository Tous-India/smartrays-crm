import { useState } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import Screen from "../../../components/Screen";
import BrandHeader from "../../../components/BrandHeader";
import TextField from "../../../components/TextField";
import PrimaryButton from "../../../components/PrimaryButton";
import ErrorBanner from "../../../components/ErrorBanner";
import LinkText from "../../../components/LinkText";
import { completeTwoFactor } from "../session.service";
import { validateTwoFactorForm } from "../../../utils/validation.utils";
import { messageFromError } from "../../../utils/apiError.utils";
import { colors, spacing, typography } from "../../../theme";

/**
 * The second factor (app-plan.md §1.0, §7.38): one field takes a six-digit
 * TOTP code or a recovery code — the server decides which it got, as on the
 * web. "Remember this device" asks for a trusted-device token (§7.40); the
 * session service keeps it and sends it on later logins.
 *
 * A pre-auth token lives five minutes and the server locks the attempt after
 * too many wrong codes (429). Both answers are shown verbatim; "Back to sign
 * in" is the way to start over, since a new login mints a new pre-auth token.
 */
function TwoFactorScreen({ navigation, route }) {
  const { preAuthToken, email } = route.params;
  const [token, setToken] = useState("");
  const [rememberDevice, setRememberDevice] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [errorMessage, setErrorMessage] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    if (isSubmitting) {
      return;
    }

    const errors = validateTwoFactorForm({ token });
    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) {
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      await completeTwoFactor(preAuthToken, token, rememberDevice);
      // Nothing to navigate to: the session store is now signed in and the
      // root navigator has already swapped this stack out.
    } catch (error) {
      setErrorMessage(messageFromError(error));
      setIsSubmitting(false);
    }
  }

  return (
    <Screen centered testID="two-factor-screen">
      <BrandHeader />
      <Text style={typography.title}>Two-factor verification</Text>
      <Text style={[typography.subtitle, styles.subtitle]}>
        Enter the code from your authenticator app for {email}. Lost it? A recovery code works here too.
      </Text>

      <ErrorBanner message={errorMessage} testID="two-factor-error" />

      <TextField
        label="Verification code"
        value={token}
        onChangeText={setToken}
        error={fieldErrors.token}
        placeholder="123456"
        keyboardType="default"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        returnKeyType="done"
        onSubmitEditing={handleSubmit}
        editable={!isSubmitting}
        testID="two-factor-code"
      />

      <Pressable
        style={styles.rememberRow}
        onPress={() => setRememberDevice((current) => !current)}
        accessibilityRole="switch"
        accessibilityState={{ checked: rememberDevice }}
        disabled={isSubmitting}
        testID="two-factor-remember"
      >
        <Switch
          value={rememberDevice}
          onValueChange={setRememberDevice}
          disabled={isSubmitting}
          trackColor={{ true: colors.brandNavy, false: colors.disabledBg }}
          thumbColor={colors.card}
        />
        <Text style={[typography.body, styles.rememberLabel]}>Remember this device</Text>
      </Pressable>

      <PrimaryButton title="Verify" onPress={handleSubmit} loading={isSubmitting} testID="two-factor-submit" />

      <View style={styles.footer}>
        <LinkText title="Back to sign in" onPress={() => navigation.goBack()} testID="two-factor-back" />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  subtitle: { marginTop: spacing.xs + 2, marginBottom: spacing.xl },
  rememberRow: { flexDirection: "row", alignItems: "center", marginBottom: spacing.xl },
  rememberLabel: { marginLeft: spacing.md },
  footer: { marginTop: spacing.lg, alignItems: "center" },
});

export default TwoFactorScreen;
