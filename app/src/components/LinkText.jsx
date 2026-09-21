import { Pressable, StyleSheet, Text } from "react-native";
import { colors, spacing, typography } from "../theme";

/** The muted text link under a form ("Forgot password?", "Back to sign in"). */
function LinkText({ title, onPress, testID }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="link" testID={testID} style={styles.pressable} hitSlop={8}>
      <Text style={styles.text}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: { alignSelf: "center", paddingVertical: spacing.sm },
  text: { ...typography.subtitle, color: colors.textSecondary },
});

export default LinkText;
