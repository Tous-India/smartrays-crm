import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { COUNTED } from "../live.utils";
import { colors, radius, spacing } from "../../../theme";

/**
 * The counts at the top (2026-10-23): Moving · Stationary · At site ·
 * Offline · Location off · Disconnected — each tappable to filter the list;
 * tap again to show everyone. Scrolls sideways on a narrow phone.
 */
function LiveCounts({ counts, meta, filter, onFilter }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} testID="live-counts">
      {COUNTED.map((key) => {
        const active = filter === key;
        return (
          <Pressable
            key={key}
            onPress={() => onFilter(active ? null : key)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={[styles.chip, active && styles.chipActive]}
            testID={`live-count-${key}`}
          >
            <View style={[styles.dot, { backgroundColor: meta[key]?.color }]} />
            <Text style={styles.text}>
              {meta[key]?.label ?? key} {counts?.[key] ?? 0}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm, paddingVertical: spacing.xs },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    minHeight: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  chipActive: { borderColor: colors.brandNavy, borderWidth: 2, backgroundColor: "#e8eef8" },
  dot: { width: 12, height: 12, borderRadius: 6 },
  text: { fontSize: 15, fontWeight: "600", color: colors.textPrimary },
});

export default LiveCounts;
