import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import ErrorBanner from "./ErrorBanner";
import LinkText from "./LinkText";
import { messageFromError } from "../utils/apiError.utils";
import { colors, spacing, typography } from "../theme";

/**
 * The three states every list screen has before it has rows (the rule for
 * this app: loading, empty and error are always drawn, never left blank):
 *
 *   isLoading           — a spinner, until the first answer
 *   error               — the server's own message, verbatim, and "Try again"
 *   isEmpty (no rows)   — the caller's empty line, e.g. "No leave requests yet"
 *
 * Renders null once there are rows to show; the caller draws them.
 */
function ListState({ isLoading, error, isEmpty, emptyText, onRetry, testID = "list-state" }) {
  if (isLoading) {
    return (
      <View style={styles.block} testID={`${testID}-loading`}>
        <ActivityIndicator color={colors.brandNavy} />
      </View>
    );
  }

  if (error) {
    return (
      <View testID={`${testID}-error`}>
        <ErrorBanner message={messageFromError(error)} testID={`${testID}-error-message`} />
        {onRetry ? <LinkText title="Try again" onPress={onRetry} testID={`${testID}-retry`} /> : null}
      </View>
    );
  }

  if (isEmpty) {
    return (
      <View style={styles.block} testID={`${testID}-empty`}>
        <Text style={styles.emptyText}>{emptyText}</Text>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  block: { paddingVertical: spacing.xxl, alignItems: "center" },
  emptyText: { ...typography.subtitle, textAlign: "center" },
});

export default ListState;
