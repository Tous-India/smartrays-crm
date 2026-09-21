import { StyleSheet, Text, View } from "react-native";
import Screen from "../../../components/Screen";
import PrimaryButton from "../../../components/PrimaryButton";
import useSessionStore from "../../../store/sessionStore";
import { signOut } from "../../auth/session.service";
import { colors, radius, spacing, typography } from "../../../theme";

/**
 * The signed-in landing screen. The shift card (app-plan.md §1.1) lands in a
 * later phase; for now this proves the session and the role that reached it.
 */
function HomeScreen() {
  const user = useSessionStore((state) => state.user);

  return (
    <Screen testID="home-screen">
      <Text style={typography.title}>Hello, {user?.name}</Text>
      <Text style={[typography.subtitle, styles.subtitle]}>Signed in as {user?.role}</Text>
      <View style={styles.card}>
        <Text style={typography.label}>Today&apos;s shift</Text>
        <Text style={[typography.body, styles.cardBody]}>Check-in and tracking arrive in the next phase.</Text>
      </View>
      <PrimaryButton title="Sign out" onPress={signOut} testID="home-sign-out" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  subtitle: { marginTop: spacing.xs, marginBottom: spacing.xl },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  cardBody: { marginTop: spacing.sm },
});

export default HomeScreen;
