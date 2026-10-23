import { Linking, StyleSheet, Text, View } from "react-native";
import Card from "../../../components/Card";
import PrimaryButton from "../../../components/PrimaryButton";
import { FIX_TEXT, detailLine } from "../live.utils";
import { colors, spacing, typography } from "../../../theme";

/**
 * "What the office sees" (2026-10-23): the employee's own live status, as
 * their manager sees it, and — when something is wrong — what to do with a
 * fix-it button: turn location on, check the internet, charge the phone.
 * `status` is GET /location/my-status. Hidden when not on a shift.
 */
const ACTIONS = {
  turn_on_location: () => Linking.sendIntent("android.settings.LOCATION_SOURCE_SETTINGS").catch(() => Linking.openSettings()),
  check_internet: () => Linking.sendIntent("android.settings.WIFI_SETTINGS").catch(() => Linking.openSettings()),
};

function MyStatusCard({ status, meta, onCheckTracking }) {
  if (!status || ["not_checked_in", "checked_out", "on_leave"].includes(status.status)) return null;
  const shown = meta[status.status] ?? { label: status.status, color: colors.textSecondary };
  const fix = status.fix ? FIX_TEXT[status.fix] : null;
  const runFix = status.fix === "open_app" ? onCheckTracking : ACTIONS[status.fix];

  return (
    <Card testID="my-status-card">
      <Text style={typography.label}>What the office sees</Text>
      <View style={styles.row}>
        <View style={[styles.dot, { backgroundColor: shown.color }]} />
        <Text style={[typography.body, styles.status]} testID="my-status">
          {shown.label}
        </Text>
      </View>
      {detailLine(status) ? <Text style={typography.small}>{detailLine(status)}</Text> : null}
      {typeof status.battery === "number" ? (
        <Text style={[typography.small, status.batteryLow && styles.warn]}>Battery {status.battery} %</Text>
      ) : null}
      {fix ? (
        <>
          <Text style={[typography.body, styles.fix]} testID="my-status-fix-text">
            {fix.message}
          </Text>
          {fix.action && runFix ? <PrimaryButton title={fix.action} onPress={runFix} style={styles.button} testID="my-status-fix" /> : null}
        </>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm },
  dot: { width: 16, height: 16, borderRadius: 8 },
  status: { fontWeight: "700", fontSize: 18 },
  warn: { color: "#ad6800", fontWeight: "700" },
  fix: { marginTop: spacing.md, color: colors.danger, fontWeight: "600" },
  button: { marginTop: spacing.md },
});

export default MyStatusCard;
