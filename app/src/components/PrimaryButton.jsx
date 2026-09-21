import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";
import { colors, radius, spacing, typography } from "../theme";

/**
 * The navy submit button. `loading` shows the spinner AND disables the
 * button — that is the double-submit guard, the same one the web's
 * `auth-submit-button` carries (§7.59): a second tap during a request does
 * nothing.
 */
function PrimaryButton({ title, onPress, loading = false, disabled = false, testID, style }) {
  const isInactive = loading || disabled;

  return (
    <Pressable
      onPress={onPress}
      disabled={isInactive}
      accessibilityRole="button"
      accessibilityState={{ disabled: isInactive, busy: loading }}
      testID={testID}
      style={({ pressed }) => [styles.button, pressed && !isInactive && styles.pressed, isInactive && styles.inactive, style]}
    >
      {loading ? <ActivityIndicator color={colors.textOnBrand} /> : <Text style={styles.title}>{title}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: colors.brandNavy,
    borderRadius: radius.md,
    paddingVertical: spacing.md + 2,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  pressed: { opacity: 0.85 },
  inactive: { opacity: 0.6 },
  title: typography.button,
});

export default PrimaryButton;
