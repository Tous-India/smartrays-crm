import { StyleSheet, Text, View } from "react-native";
import Card from "../../../components/Card";
import StatusPill from "../../../components/StatusPill";
import { isDueToday, isOverdue, subtaskProgress } from "../services.utils";
import { formatShortDate } from "../../../utils/date.utils";
import { colors, spacing, typography } from "../../../theme";

/**
 * One service in a list: the title, its due date said plainly (OVERDUE in
 * red, "Due today", or the date), who assigned it, and the subtask count.
 * The whole card opens the detail.
 */
function ServiceRow({ service, assignedByName, onPress }) {
  const overdue = isOverdue(service);
  const dueToday = isDueToday(service);
  const progress = subtaskProgress(service);

  return (
    <Card onPress={onPress} testID={`service-row-${service._id}`}>
      <View style={styles.headerRow}>
        <Text style={[typography.body, styles.title]} numberOfLines={2}>
          {service.title}
        </Text>
        {overdue ? <StatusPill label="Overdue" tone="danger" testID={`service-overdue-${service._id}`} /> : null}
        {!overdue && dueToday ? <StatusPill label="Due today" tone="warning" /> : null}
        {service.status === "completed" ? <StatusPill label="Completed" tone="success" /> : null}
      </View>
      <Text style={[typography.small, styles.meta]}>
        {service.dueDate ? `Due ${formatShortDate(service.dueDate)}` : "No due date"}
        {assignedByName ? ` · from ${assignedByName}` : ""}
        {progress ? ` · ${progress.done}/${progress.total} subtasks` : ""}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.sm },
  title: { flex: 1, fontWeight: "600", color: colors.textPrimary },
  meta: { marginTop: spacing.xs },
});

export default ServiceRow;
