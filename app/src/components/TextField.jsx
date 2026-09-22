import { StyleSheet, Text, TextInput, View } from "react-native";
import { colors, radius, spacing, typography } from "../theme";

/**
 * A labelled input in the auth pages' style — uppercase label above, the
 * field, and the error line beneath it when there is one. `error` is shown
 * verbatim: a backend validation message belongs to the user, not the log.
 * `ref` reaches the TextInput (React 19 passes it as an ordinary prop), so a
 * form can move focus from one field to the next.
 *
 * `trailing` is an element laid over the right end of the field (the
 * password field's show/hide button); the text is padded so it never runs
 * underneath. `style` is added to the input's own (a taller multiline box).
 */

/** The width reserved at the right end of the field for `trailing`. */
export const TRAILING_WIDTH = 44;

function TextField({ label, error, containerStyle, trailing, ref, style, ...inputProps }) {
  return (
    <View style={[styles.container, containerStyle]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View>
        <TextInput
          ref={ref}
          style={[
            styles.input,
            error && styles.inputError,
            inputProps.editable === false && styles.inputDisabled,
            trailing && styles.inputWithTrailing,
            style,
          ]}
          placeholderTextColor={colors.disabled}
          autoCapitalize="none"
          autoCorrect={false}
          {...inputProps}
        />
        {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
      </View>
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
  inputWithTrailing: { paddingRight: TRAILING_WIDTH + spacing.xs },
  inputError: { borderColor: colors.danger },
  inputDisabled: { backgroundColor: colors.page, color: colors.textSecondary },
  trailing: {
    position: "absolute",
    top: 0,
    bottom: 0,
    right: 0,
    width: TRAILING_WIDTH,
    justifyContent: "center",
    alignItems: "center",
  },
  error: { ...typography.small, color: colors.danger, marginTop: spacing.xs },
});

export default TextField;
