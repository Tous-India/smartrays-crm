import { StyleSheet, Text, View } from "react-native";
import Screen from "../../../components/Screen";
import BrandHeader from "../../../components/BrandHeader";
import { spacing, typography } from "../../../theme";

/** Placeholder until Stage 3 — the shell renders the auth stack around it. */
function LoginScreen() {
  return (
    <Screen centered testID="login-screen">
      <BrandHeader />
      <View style={styles.card}>
        <Text style={typography.title}>Welcome back</Text>
        <Text style={[typography.subtitle, styles.subtitle]}>Sign in to your account to continue</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: "flex-start" },
  subtitle: { marginTop: spacing.xs + 2 },
});

export default LoginScreen;
