import { StyleSheet, Text, TextInput, View } from "react-native";
import { colors, radius, spacing, typography } from "../theme";

/**
 * A labelled input in the auth pages' style — uppercase label above, the
 * field, and the error line beneath it when there is one. `error` is shown
 * verbatim: a backend validation message belongs to the user, not the log.
 */
function TextField({ label, error, containerStyle, ...inputProps }) {
  return (
    <View style={[styles.container, containerStyle]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        style={[styles.input, error && styles.inputError, inputProps.editable === false && styles.inputDisabled]}
        placeholderTextColor={colors.disabled}
        autoCapitalize="none"
        autoCorrect={false}
        {...inputProps}
      />
      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: spacing.lg },
  label: { ...typography.label, marginBottom: spacing.sm },
  input: {
    ...typography.body,
    fontSize: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  inputError: { borderColor: colors.danger },
  inputDisabled: { backgroundColor: colors.page, color: colors.textSecondary },
  error: { ...typography.small, color: colors.danger, marginTop: spacing.xs },
});

export default TextField;
