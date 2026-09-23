import { StyleSheet, Text, View } from "react-native";
import ErrorBanner from "./ErrorBanner";
import LinkText from "./LinkText";
import {
  AttendanceSkeletonRow,
  GenericSkeletonRow,
  LeaveSkeletonRow,
  ServiceSkeletonRow,
  TeamSkeletonRow,
} from "./Skeleton";
import { messageFromError } from "../utils/apiError.utils";
import { spacing, typography } from "../theme";

/**
 * The three states every list screen has before it has rows (the rule for
 * this app: loading, empty and error are always drawn, never left blank):
 *
 *   isLoading           — placeholders shaped like the rows that are coming
 *   error               — the server's own message, verbatim, and "Try again"
 *   isEmpty (no rows)   — the caller's empty line, e.g. "No leave requests yet"
 *
 * Renders null once there are rows to show; the caller draws them.
 *
 * `skeleton` picks the shape ("service", "leave", "attendance", "team", or
 * the generic two-line card) and `skeletonCount` how many — a screen never
 * writes a loader of its own, which is what keeps them all consistent.
 */
const SHAPES = {
  service: ServiceSkeletonRow,
  leave: LeaveSkeletonRow,
  attendance: AttendanceSkeletonRow,
  team: TeamSkeletonRow,
  generic: GenericSkeletonRow,
};

function ListState({ isLoading, error, isEmpty, emptyText, onRetry, skeleton = "generic", skeletonCount = 3, testID = "list-state" }) {
  if (isLoading) {
    const Row = SHAPES[skeleton] || SHAPES.generic;

    return (
      <View testID={`${testID}-loading`}>
        {Array.from({ length: skeletonCount }, (_, index) => (
          <Row key={index} />
        ))}
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
