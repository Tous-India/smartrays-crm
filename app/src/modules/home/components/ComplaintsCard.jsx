import { StyleSheet, Text, View } from "react-native";
import Card from "../../../components/Card";
import StatusPill from "../../../components/StatusPill";
import { SkeletonBlock } from "../../../components/Skeleton";
import { CATEGORY_LABEL, isActive, overdueText, sortForWork } from "../../complaints/complaints.utils";
import { messageFromError } from "../../../utils/apiError.utils";
import { colors, spacing, typography } from "../../../theme";

const PREVIEW_COUNT = 3;

/**
 * "Customer complaints" on Home (2026-10-22): the complaints assigned to me
 * that are still open, overdue first, with a red pill when any has passed the
 * server's escalation time. Tapping opens the list. Its own loading, empty
 * and error lines, like the services card beside it.
 */
function ComplaintsCard({ complaints, isLoading, error, onOpen }) {
  const open = sortForWork((complaints || []).filter(isActive));
  const showCounts = !isLoading && !error;
  const overdueCount = showCounts ? open.filter((ticket) => overdueText(ticket)).length : 0;

  return (
    <Card onPress={onOpen} testID="complaints-card">
      <View style={styles.headerRow}>
        <Text style={typography.label}>Customer complaints</Text>
        {overdueCount > 0 ? <StatusPill label={`${overdueCount} overdue`} tone="danger" testID="complaints-card-overdue" /> : null}
      </View>

      {isLoading ? (
        <SkeletonBlock width="55%" height={12} style={styles.line} />
      ) : error ? (
        <Text style={[typography.small, styles.line, styles.danger]}>{messageFromError(error)}</Text>
      ) : open.length === 0 ? (
        <Text style={[typography.subtitle, styles.line]} testID="complaints-card-empty">
          No open complaints for you.
        </Text>
      ) : (
        <>
          {open.slice(0, PREVIEW_COUNT).map((ticket) => (
            <View key={ticket._id} style={styles.row}>
              <Text style={[typography.body, styles.title]} numberOfLines={1}>
                {ticket.customerName || "Customer"}
              </Text>
              <Text style={[typography.small, overdueText(ticket) && styles.danger]}>{CATEGORY_LABEL[ticket.category] || "Complaint"}</Text>
            </View>
          ))}
          <Text style={[typography.small, styles.line]}>
            {open.length > PREVIEW_COUNT ? `and ${open.length - PREVIEW_COUNT} more · ` : ""}Tap to see all
          </Text>
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

export default ComplaintsCard;
