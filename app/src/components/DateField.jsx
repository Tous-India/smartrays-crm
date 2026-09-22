import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import Ionicons from "@react-native-vector-icons/ionicons";
import { formatDate } from "../utils/date.utils";
import { colors, radius, spacing, typography } from "../theme";

/**
 * A labelled date in the TextField's clothes: tapping it opens the
 * platform's own date dialog (`@react-native-community/datetimepicker`);
 * the chosen day comes back as a Date at local midnight. `minimumDate`
 * keeps the dialog from offering days the caller will not accept.
 */
function DateField({ label, value, onChange, minimumDate, error, testID }) {
  const [isOpen, setIsOpen] = useState(false);

  function handleChange(event, picked) {
    setIsOpen(false);

    if (event.type === "set" && picked) {
      onChange(new Date(picked.getFullYear(), picked.getMonth(), picked.getDate()));
    }
  }

  return (
    <View style={styles.container}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Pressable
        onPress={() => setIsOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value ? formatDate(value) : "not set"}`}
        style={[styles.field, error && styles.fieldError]}
        testID={testID}
      >
        <Text style={[typography.body, styles.value, !value && styles.placeholder]}>{value ? formatDate(value) : "Pick a date"}</Text>
        <Ionicons name="calendar-outline" size={20} color={colors.textSecondary} />
      </Pressable>
      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      {isOpen ? <DateTimePicker value={value || new Date()} mode="date" display="default" minimumDate={minimumDate} onChange={handleChange} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: spacing.lg },
  label: { ...typography.label, marginBottom: spacing.sm },
  field: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 48,
  },
  fieldError: { borderColor: colors.danger },
  value: { fontSize: 16 },
  placeholder: { color: colors.disabled },
  error: { ...typography.small, color: colors.danger, marginTop: spacing.xs },
});

export default DateField;
