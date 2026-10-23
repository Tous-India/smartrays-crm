import { StyleSheet, Text, View } from "react-native";
import Screen from "../../../components/Screen";
import ScreenHeader from "../../../components/ScreenHeader";
import Card from "../../../components/Card";
import ListState from "../../../components/ListState";
import useServerData from "../../../hooks/useServerData";
import useLiveMeta from "../hooks/useLiveMeta";
import { getDayTimeline } from "../api/liveApi";
import { detailLine, todayKey } from "../live.utils";
import { formatTime } from "../../../utils/date.utils";
import { colors, spacing, typography } from "../../../theme";

/**
 * One person's day (2026-10-23): their status now, then the day as a short
 * timeline — "9:40 checked in → 10:05 moving → 10:50 at Sharma Residence →
 * 12:10 location off". Opened from the team map or list. `person` is the
 * live-status row it was opened from.
 */
function PersonDayScreen({ navigation, route }) {
  const { person } = route.params;
  const meta = useLiveMeta();
  const day = useServerData(async () => (await getDayTimeline(person.employeeId, todayKey())).data.data, { deps: [person.employeeId] });
  const status = meta[person.status] ?? { label: person.status, color: colors.textSecondary };

  return (
    <Screen onRefresh={day.refetch} refreshing={day.isRefreshing} testID="person-day-screen">
      <ScreenHeader title={person.name} subtitle="Today" onBack={() => navigation.goBack()} />

      <Card>
        <View style={styles.row}>
          <View style={[styles.dot, { backgroundColor: status.color }]} />
          <Text style={[typography.body, styles.bold]}>
            {status.label}
            {person.since ? ` since ${formatTime(person.since)}` : ""}
          </Text>
        </View>
        {detailLine(person) ? <Text style={[typography.small, styles.line]}>{detailLine(person)}</Text> : null}
        {typeof person.battery === "number" ? (
          <Text style={[typography.small, styles.line, person.batteryLow && styles.warn]}>
            Battery {person.battery} %{person.charging ? " (charging)" : ""}
          </Text>
        ) : null}
        {person.lastPingAt ? <Text style={[typography.small, styles.line]}>Last update {formatTime(person.lastPingAt)}</Text> : null}
      </Card>

      <Text style={[typography.label, styles.section]}>The day</Text>
      <ListState
        isLoading={day.isLoading}
        error={day.error}
        onRetry={day.refetch}
        isEmpty={Boolean(day.data) && day.data.entries.length === 0}
        emptyText="Nothing recorded today."
        testID="person-day-timeline"
      />
      {(day.data?.entries || []).map((entry, index) => (
        <View key={`${entry.at}-${entry.status}-${index}`} style={styles.step} testID={`person-day-step-${index}`}>
          <Text style={[typography.small, styles.time]}>{formatTime(entry.at)}</Text>
          <View style={[styles.stepDot, { backgroundColor: meta[entry.status]?.color ?? colors.brandNavy }]} />
          <Text style={[typography.body, styles.stepLabel]}>{entry.label}</Text>
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  dot: { width: 16, height: 16, borderRadius: 8 },
  bold: { fontWeight: "600" },
  line: { marginTop: spacing.xs },
  warn: { color: "#ad6800", fontWeight: "700" },
  section: { marginTop: spacing.lg, marginBottom: spacing.sm },
  step: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  time: { width: 72, textAlign: "right" },
  stepDot: { width: 12, height: 12, borderRadius: 6 },
  stepLabel: { flex: 1 },
});

export default PersonDayScreen;
