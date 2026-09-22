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

/**
 * What the card says about tracking (app-plan.md §1.1): active with the last
 * fix, paused with why and a way to fix it, or off. The queue size shows
 * whenever fixes are waiting — offline is the usual reason.
 */
function TrackingLine({ trackingState, isOnline, onFixTracking, now }) {
  if (!trackingState || trackingState.status === "off") {
    return null;
  }

  const queued =
    trackingState.queuedCount > 0 ? ` · ${trackingState.queuedCount} queued${isOnline ? "" : " (offline)"}` : "";

  if (trackingState.status === "tracking") {
    const last = trackingState.lastCapturedAt
      ? `last fix ${formatElapsed(trackingState.lastCapturedAt, now)} ago`
      : "waiting for the first fix";

    return (
      <Text style={[typography.small, styles.trackingOk]} testID="shift-tracking-active">
        Tracking active · {last}
        {queued}
      </Text>
    );
  }

  // The forgotten check-out (§7.74): tracking stopped on its own once the
  // shift ran past the server's limit; the only fix is a check-out, which
  // is the button right underneath.
  if (trackingState.reason === "shift_too_long") {
    return (
      <View style={styles.trackingRow} testID="shift-tracking-stopped">
        <Text style={[typography.small, styles.trackingWarn]}>
          Tracking stopped — this shift has been open more than {trackingState.hoursLimit} hours. Please check out.
          {queued}
        </Text>
      </View>
    );
  }

  const why =
    trackingState.reason === "declined"
      ? "you chose not to share your location"
      : trackingState.reason === "unanswered"
        ? "please review the tracking notice"
        : "location permission needed";

  return (
    <View style={styles.trackingRow} testID="shift-tracking-paused">
      <Text style={[typography.small, styles.trackingWarn]}>
        Tracking paused — {why}
        {queued}
      </Text>
      <Text style={styles.trackingFix} onPress={onFixTracking} accessibilityRole="button" testID="shift-tracking-fix">
        Turn on
      </Text>
    </View>
  );
}

function TodayShiftCard({
  openRecord,
  todayRecord,
  isLoading,
  error,
  isOnline,
  onCheckIn,
  onCheckOut,
  trackingState,
  onFixTracking,
}) {
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
        <TrackingLine trackingState={trackingState} isOnline={isOnline} onFixTracking={onFixTracking} now={now} />
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
  trackingOk: { color: colors.brandGreen, marginTop: spacing.sm },
  trackingRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm },
  trackingWarn: { color: colors.danger },
  trackingFix: { ...typography.small, color: colors.brandNavy, fontWeight: "600", textDecorationLine: "underline" },
});

export default TodayShiftCard;
