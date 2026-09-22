import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../theme";

/**
 * Two or three options in a row, one selected — the app's version of the
 * web's segmented filter (To Do | Completed). `options` is
 * `[{ value, label }]`; the selected one is the caller's state.
 */
function SegmentedControl({ options, value, onChange, testID }) {
  return (
    <View style={styles.row} accessibilityRole="tablist" testID={testID}>
      {options.map((option) => {
        const isSelected = option.value === value;

        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected }}
            style={[styles.segment, isSelected && styles.segmentSelected]}
            testID={testID ? `${testID}-${option.value}` : undefined}
          >
            <Text style={[styles.label, isSelected && styles.labelSelected]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    backgroundColor: colors.brandPanelAlt,
    borderRadius: radius.md,
    padding: 3,
    marginBottom: spacing.lg,
  },
  segment: { flex: 1, paddingVertical: spacing.sm, alignItems: "center", borderRadius: radius.sm },
  segmentSelected: { backgroundColor: colors.card },
  label: { ...typography.body, fontWeight: "600", color: colors.textSecondary },
  labelSelected: { color: colors.brandNavy },
});

export default SegmentedControl;
