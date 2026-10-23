import { StyleSheet, Text, View } from "react-native";
import Card from "../../../components/Card";
import StatusPill from "../../../components/StatusPill";
import { SkeletonBlock } from "../../../components/Skeleton";
import { isActive, isVisitOverdue } from "../../complaints/complaints.utils";
import { messageFromError } from "../../../utils/apiError.utils";
import { colors, spacing, typography } from "../../../theme";

const PREVIEW_COUNT = 3;

/**
 * "Customer complaints" on Home (2026-10-23). For an assigner: how many are
 * not assigned yet, and the newest of them. For anyone else: their own open
 * complaints, with a red pill when a visit date has passed. Tapping opens the
 * list. Its own loading, empty and error lines, like the services card.
 */
function ComplaintsCard({ complaints, isLoading, error, onOpen, isAssigner = false }) {
  const rows = complaints || [];
  const shown = isAssigner ? rows.filter((row) => row.status === "open") : rows.filter(isActive);
  const ready = !isLoading && !error;
  const overdueCount = ready && !isAssigner ? shown.filter((row) => isVisitOverdue(row)).length : 0;

  return (
    <Card onPress={onOpen} testID="complaints-card">
      <View style={styles.headerRow}>
        <Text style={typography.label}>Customer complaints</Text>
        {ready && isAssigner && shown.length > 0 ? (
          <StatusPill label={`${shown.length} not assigned`} tone="danger" testID="complaints-card-unassigned" />
        ) : null}
        {overdueCount > 0 ? <StatusPill label={`${overdueCount} visit date passed`} tone="danger" testID="complaints-card-overdue" /> : null}
      </View>

      {isLoading ? (
        <SkeletonBlock width="55%" height={12} style={styles.line} />
      ) : error ? (
        <Text style={[typography.small, styles.line, styles.danger]}>{messageFromError(error)}</Text>
      ) : shown.length === 0 ? (
        <Text style={[typography.subtitle, styles.line]} testID="complaints-card-empty">
          {isAssigner ? "Every complaint is assigned." : "No open complaints for you."}
        </Text>
      ) : (
        <>
          {shown.slice(0, PREVIEW_COUNT).map((row) => (
            <View key={row._id} style={styles.row}>
              <Text style={[typography.body, styles.title]} numberOfLines={1}>
                {row.customerName || row.companyName || row.contactName || "Customer"}
              </Text>
              <Text style={[typography.small, isVisitOverdue(row) && styles.danger]}>{row.number}</Text>
            </View>
          ))}
          <Text style={[typography.small, styles.line]}>
            {shown.length > PREVIEW_COUNT ? `and ${shown.length - PREVIEW_COUNT} more · ` : ""}Tap to see all
          </Text>
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  line: { marginTop: spacing.sm },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.md, marginTop: spacing.sm },
  title: { flex: 1 },
  danger: { color: colors.danger },
});

export default ComplaintsCard;
