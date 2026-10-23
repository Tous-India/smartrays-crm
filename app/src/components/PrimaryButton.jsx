import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";
import { colors, radius, spacing, typography } from "../theme";

/**
 * The navy submit button. `loading` shows a small spinner beside the label
 * AND disables the button — that is the double-submit guard, the same one
 * the web's `auth-submit-button` carries (§7.59): a second tap during a
 * request does nothing. The label stays readable while the request runs, so
 * the button still says what it is doing.
 */
function PrimaryButton({ title, onPress, loading = false, disabled = false, size, testID, style }) {
  const isInactive = loading || disabled;

  return (
    <Pressable
      onPress={onPress}
      disabled={isInactive}
      accessibilityRole="button"
      accessibilityState={{ disabled: isInactive, busy: loading }}
      testID={testID}
      style={({ pressed }) => [styles.button, size === "large" && styles.large, pressed && !isInactive && styles.pressed, isInactive && styles.inactive, style]}
    >
      {loading ? <ActivityIndicator size="small" color={colors.textOnBrand} style={styles.spinner} /> : null}
      <Text style={[styles.title, size === "large" && styles.largeTitle]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: colors.brandNavy,
    borderRadius: radius.md,
    paddingVertical: spacing.md + 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    minHeight: 48,
  },
  // size="large": the shift card's Check in / Check out (2026-10-23).
  large: { minHeight: 64, borderRadius: radius.lg },
  largeTitle: { fontSize: 20 },
  spinner: { marginRight: 0 },
  pressed: { opacity: 0.85 },
  inactive: { opacity: 0.6 },
  title: typography.button,
});

export default PrimaryButton;
