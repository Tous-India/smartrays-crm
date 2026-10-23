import { Pressable, StyleSheet, Text, View } from "react-native";
import Card from "../../../components/Card";
import ListState from "../../../components/ListState";
import PrimaryButton from "../../../components/PrimaryButton";
import { FILTER_GROUPS, GROUP_LABELS } from "../live.utils";
import { colors, radius, spacing, typography } from "../../../theme";

/**
 * Today at a glance (2026-10-23) — on Home for managers and admins: on
 * shift, need attention, not checked in, checked out, on leave. Each count
 * opens the Team tab's Live list filtered to those people; the button opens
 * the live map with everyone. Counted from GET /location/live-status (the
 * server's statuses; an admin's answer is everyone).
 */
const ORDER = ["on_shift", "attention", "not_checked_in", "checked_out", "on_leave"];
const TONES = { attention: colors.danger };

export function glanceCounts(people) {
  const counts = Object.fromEntries(ORDER.map((key) => [key, 0]));
  people.forEach((person) => {
    ORDER.forEach((key) => {
      const statuses = FILTER_GROUPS[key] ?? [key];
      if (statuses.includes(person.status)) counts[key] += 1;
    });
  });
  return counts;
}

function TodayGlanceCard({ live, onOpen }) {
  if (live.isLoading || live.error || !live.data) {
    return (
      <Card testID="glance-card">
        <Text style={typography.label}>Today at a glance</Text>
        <ListState isLoading={live.isLoading} error={live.error} onRetry={live.refetch} testID="glance" />
      </Card>
    );
  }

  const counts = glanceCounts(live.data.people);

  return (
    <Card testID="glance-card">
      <Text style={typography.label}>Today at a glance</Text>
      <View style={styles.grid}>
        {ORDER.map((key) => (
          <Pressable
            key={key}
            onPress={() => onOpen(key)}
            accessibilityRole="button"
            accessibilityLabel={`${GROUP_LABELS[key]}: ${counts[key]}`}
            style={styles.tile}
            testID={`glance-${key}`}
          >
            <Text style={[styles.count, TONES[key] && counts[key] > 0 && { color: TONES[key] }]}>{counts[key]}</Text>
            <Text style={typography.small}>{GROUP_LABELS[key]}</Text>
          </Pressable>
        ))}
      </View>
      <PrimaryButton title="Open live map" onPress={() => onOpen(null)} style={styles.button} testID="glance-open-map" />
    </Card>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md },
  tile: {
    flexGrow: 1,
    flexBasis: "30%",
    minHeight: 64,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
    justifyContent: "center",
  },
  count: { fontSize: 22, fontWeight: "700", color: colors.textPrimary },
  button: { marginTop: spacing.md },
});

export default TodayGlanceCard;
