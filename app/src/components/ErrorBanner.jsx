import { StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../theme";

/** The AntD error alert, as the web login renders it above the form. */
function ErrorBanner({ message, testID = "error-banner" }) {
  if (!message) {
    return null;
  }

  return (
    <View style={styles.banner} accessibilityRole="alert" testID={testID}>
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.dangerBg,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
  },
  text: { ...typography.body, color: colors.textPrimary },
});

export default ErrorBanner;
