import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import PrimaryButton from "../../../components/PrimaryButton";
import { formatClockTime, formatElapsed } from "../attendance.utils";
import { colors, radius, spacing, typography } from "../../../theme";

/**
 * The shift card (app-plan.md §1.1) in its three states:
 *
 *   not checked in  — "Check in"
 *   checked in      — since when, elapsed (ticks each minute), "Check out"
 *   checked out     — today's times and the server's working hours, and a
 *                     second check-in, which the server allows after a check-out
 *
 * The state is read straight off the records the server returned — the
 * open record if there is one, else today's latest — never computed here.
 * Offline, the action stays visible and disabled with the reason underneath
 * (§3.3): check-in and check-out are server events with a photo and cannot
 * be queued.
 */
function useMinuteTick() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60 * 1000);

    return () => clearInterval(timer);
  }, []);

  return now;
}

function TodayShiftCard({ openRecord, todayRecord, isLoading, error, isOnline, onCheckIn, onCheckOut }) {
  const now = useMinuteTick();

  if (isLoading) {
    return (
      <View style={styles.card} testID="shift-card-loading">
        <ActivityIndicator color={colors.brandNavy} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.card} testID="shift-card-error">
        <Text style={typography.label}>Today&apos;s shift</Text>
        <Text style={[typography.body, styles.line]}>Could not load your attendance. Pull to refresh or try again later.</Text>
      </View>
    );
  }

  if (openRecord) {
    return (
      <View style={styles.card} testID="shift-card-checked-in">
        <View style={styles.headerRow}>
          <Text style={typography.label}>Today&apos;s shift</Text>
          <Text style={[typography.small, styles.badge, styles.badgeActive]}>Checked in</Text>
        </View>
        <Text style={[typography.title, styles.elapsed]}>{formatElapsed(openRecord.checkIn.time, now)}</Text>
        <Text style={[typography.subtitle, styles.line]}>Since {formatClockTime(openRecord.checkIn.time)}</Text>
        <PrimaryButton title="Check out" onPress={onCheckOut} disabled={!isOnline} testID="shift-check-out" style={styles.button} />
        {!isOnline && <Text style={styles.offline}>No connection — check-out needs the server.</Text>}
      </View>
    );
  }

  if (todayRecord?.checkOut?.time) {
    return (
      <View style={styles.card} testID="shift-card-checked-out">
        <View style={styles.headerRow}>
          <Text style={typography.label}>Today&apos;s shift</Text>
          <Text style={[typography.small, styles.badge]}>Checked out</Text>
        </View>
        <Text style={[typography.body, styles.line]}>
          {formatClockTime(todayRecord.checkIn.time)} – {formatClockTime(todayRecord.checkOut.time)}
        </Text>
        {typeof todayRecord.workingHours === "number" && (
          <Text style={[typography.subtitle, styles.line]}>Working hours: {todayRecord.workingHours.toFixed(2)}</Text>
        )}
        {todayRecord.status && <Text style={[typography.subtitle, styles.line]}>Status: {todayRecord.status}</Text>}
        <PrimaryButton title="Check in again" onPress={onCheckIn} disabled={!isOnline} testID="shift-check-in" style={styles.button} />
        {!isOnline && <Text style={styles.offline}>No connection — check-in needs the server.</Text>}
      </View>
    );
  }

  return (
    <View style={styles.card} testID="shift-card-not-checked-in">
      <View style={styles.headerRow}>
        <Text style={typography.label}>Today&apos;s shift</Text>
        <Text style={[typography.small, styles.badge]}>Not checked in</Text>
      </View>
      <Text style={[typography.body, styles.line]}>Check in with a photo and your location to start your shift.</Text>
      <PrimaryButton title="Check in" onPress={onCheckIn} disabled={!isOnline} testID="shift-check-in" style={styles.button} />
      {!isOnline && <Text style={styles.offline}>No connection — check-in needs the server.</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  badge: {
    color: colors.textLabel,
    backgroundColor: colors.brandPanelAlt,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    overflow: "hidden",
  },
  badgeActive: { color: colors.textOnBrand, backgroundColor: colors.brandGreen },
  elapsed: { marginTop: spacing.md },
  line: { marginTop: spacing.xs },
  button: { marginTop: spacing.lg },
  offline: { ...typography.small, color: colors.danger, marginTop: spacing.sm },
});

export default TodayShiftCard;
