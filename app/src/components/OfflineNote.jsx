import { StyleSheet, Text } from "react-native";
import { colors, spacing, typography } from "../theme";

/**
 * The line under a disabled action when there is no network (app-plan.md
 * §3.3): the button stays where it is, and this says why it does nothing.
 * `what` names the action — "Applying for leave needs the server."
 */
function OfflineNote({ what, testID = "offline-note" }) {
  return (
    <Text style={styles.text} testID={testID}>
      No connection — {what} needs the server.
    </Text>
  );
}

const styles = StyleSheet.create({
  text: { ...typography.small, color: colors.danger, marginTop: spacing.sm },
});

export default OfflineNote;
