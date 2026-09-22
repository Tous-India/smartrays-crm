import { Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import Screen from "../../../components/Screen";
import ScreenHeader from "../../../components/ScreenHeader";
import Card from "../../../components/Card";
import PrimaryButton from "../../../components/PrimaryButton";
import useServerData from "../../../hooks/useServerData";
import useSessionStore from "../../../store/sessionStore";
import { signOut } from "../../auth/session.service";
import { getMyTeam } from "../api/meApi";
import { SCREENS } from "../../../constants/screens.constants";
import { messageFromError } from "../../../utils/apiError.utils";
import { colors, spacing, typography } from "../../../theme";

/**
 * Me (app-plan.md §1.6): who the server says you are — name, role,
 * designation, department (your team) and manager (its head) — read-only;
 * the doors to attendance history and payslips; and sign out. Editing a
 * profile stays on the web.
 */
function MeScreen({ navigation }) {
  const user = useSessionStore((state) => state.user);
  const team = useServerData(async () => (await getMyTeam()).data.data);

  function teamLine(pick) {
    if (team.isLoading) {
      return "Loading…";
    }

    if (team.error) {
      return messageFromError(team.error);
    }

    return pick(team.data) || "—";
  }

  return (
    <Screen onRefresh={team.refetch} refreshing={team.isRefreshing} testID="me-screen">
      <ScreenHeader title="Me" />

      <Card testID="me-profile">
        <Text style={typography.title}>{user?.name}</Text>
        <Text style={[typography.subtitle, styles.line]}>{user?.email}</Text>
        <Row label="Role" value={user?.role} />
        {user?.designation ? <Row label="Designation" value={user.designation} /> : null}
        <Row label="Department" value={teamLine((data) => data?.name)} testID="me-department" />
        <Row label="Manager" value={teamLine((data) => data?.head?.name)} testID="me-manager" />
      </Card>

      <LinkRow
        icon="time-outline"
        title="Attendance history"
        subtitle="Your days, times and hours by month"
        onPress={() => navigation.navigate(SCREENS.ATTENDANCE_HISTORY)}
        testID="me-attendance-history"
      />
      <LinkRow
        icon="document-text-outline"
        title="Payslips"
        subtitle="Approved payroll runs, as PDFs"
        onPress={() => navigation.navigate(SCREENS.PAYSLIPS)}
        testID="me-payslips"
      />

      <PrimaryButton title="Sign out" onPress={signOut} style={styles.signOut} testID="me-sign-out" />
    </Screen>
  );
}

function Row({ label, value, testID }) {
  return (
    <>
      <Text style={[typography.label, styles.rowLabel]}>{label}</Text>
      <Text style={typography.body} testID={testID}>
        {value}
      </Text>
    </>
  );
}

function LinkRow({ icon, title, subtitle, onPress, testID }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.link, pressed && styles.linkPressed]} testID={testID}>
      <Ionicons name={icon} size={24} color={colors.brandNavy} />
      <View style={styles.linkText}>
        <Text style={[typography.body, styles.linkTitle]}>{title}</Text>
        <Text style={typography.small}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  line: { marginTop: spacing.xs },
  rowLabel: { marginTop: spacing.md, marginBottom: 2 },
  link: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.lg,
    marginBottom: spacing.md,
    minHeight: 64,
  },
  linkPressed: { opacity: 0.8 },
  linkText: { flex: 1 },
  linkTitle: { fontWeight: "600" },
  signOut: { marginTop: spacing.xl },
});

export default MeScreen;
