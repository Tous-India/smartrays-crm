import { StyleSheet, Text, View } from "react-native";
import Card from "../../../components/Card";
import StatusPill from "../../../components/StatusPill";
import { isDueToday, isOverdue, sortByUrgency } from "../../services/services.utils";
import { formatShortDate } from "../../../utils/date.utils";
import { messageFromError } from "../../../utils/apiError.utils";
import { colors, spacing, typography } from "../../../theme";

/** How many of the to-do list the card lists before "and N more". */
const PREVIEW_COUNT = 3;

/**
 * "My Services due" under the shift card (app-plan.md §1.1, STEP 2): the
 * to-do services the server returned for the caller, overdue first, the
 * first few by title with their due date, and a count of the rest. Tapping
 * the card opens the Services tab. Its own loading, empty and error lines —
 * the shift card above must never wait on this.
 */
function ServicesDueCard({ services, isLoading, error, onOpen }) {
  const todo = sortByUrgency(services || []);
  // The counts belong to a list that loaded; a stale list behind an error
  // must not keep announcing "1 overdue".
  const showCounts = !isLoading && !error;
  const overdueCount = showCounts ? todo.filter((service) => isOverdue(service)).length : 0;
  const dueTodayCount = showCounts ? todo.filter((service) => isDueToday(service)).length : 0;

  return (
    <Card onPress={onOpen} testID="services-due-card">
      <View style={styles.headerRow}>
        <Text style={typography.label}>My Services due</Text>
        {overdueCount > 0 ? <StatusPill label={`${overdueCount} overdue`} tone="danger" testID="services-due-overdue" /> : null}
        {overdueCount === 0 && dueTodayCount > 0 ? <StatusPill label={`${dueTodayCount} due today`} tone="warning" /> : null}
      </View>

      {isLoading ? (
        <Text style={[typography.subtitle, styles.line]}>Loading…</Text>
      ) : error ? (
        <Text style={[typography.small, styles.line, styles.danger]} testID="services-due-error">
          {messageFromError(error)}
        </Text>
      ) : todo.length === 0 ? (
        <Text style={[typography.subtitle, styles.line]} testID="services-due-empty">
          Nothing assigned to you right now.
        </Text>
      ) : (
        <>
          {todo.slice(0, PREVIEW_COUNT).map((service) => (
            <View key={service._id} style={styles.row} testID={`services-due-row-${service._id}`}>
              <Text style={[typography.body, styles.title]} numberOfLines={1}>
                {service.title}
              </Text>
              <Text style={[typography.small, isOverdue(service) && styles.danger]}>
                {service.dueDate ? formatShortDate(service.dueDate) : "no date"}
              </Text>
            </View>
          ))}
          {todo.length > PREVIEW_COUNT ? (
            <Text style={[typography.small, styles.line]}>and {todo.length - PREVIEW_COUNT} more · tap to see all</Text>
          ) : (
            <Text style={[typography.small, styles.line]}>Tap to see all</Text>
          )}
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm },
  line: { marginTop: spacing.sm },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.md, marginTop: spacing.sm },
  title: { flex: 1 },
  danger: { color: colors.danger },
});

export default ServicesDueCard;
