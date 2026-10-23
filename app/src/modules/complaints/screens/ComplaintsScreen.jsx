import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Screen from "../../../components/Screen";
import ScreenHeader from "../../../components/ScreenHeader";
import Card from "../../../components/Card";
import StatusPill from "../../../components/StatusPill";
import ListState from "../../../components/ListState";
import SegmentedControl from "../../../components/SegmentedControl";
import useServerData from "../../../hooks/useServerData";
import useMyPermissions, { can } from "../../../hooks/useMyPermissions";
import { listComplaints } from "../api/complaintApi";
import { PRIORITY, STATUS_LABEL, STATUS_TONE, isActive, isResolved, isVisitOverdue, timeAgo } from "../complaints.utils";
import ShareComplaintLink from "../components/ShareComplaintLink";
import { SCREENS } from "../../../constants/screens.constants";
import { formatDate } from "../../../utils/date.utils";
import { colors, spacing, typography } from "../../../theme";

/**
 * Customer complaints (2026-10-23).
 *
 * - Assigners (admin, or complaints.assign / complaints.view_all): every
 *   complaint, unassigned ones on top and marked, filters All / Unassigned /
 *   Assigned / Resolved, and the share-link card.
 * - Everyone else: "My complaints" — the server sends only theirs — active
 *   first, then the resolved ones.
 * Tap → the complaint.
 */
const FILTERS = [
  { value: "all", label: "All", match: () => true },
  { value: "unassigned", label: "Unassigned", match: (row) => row.status === "open" },
  { value: "assigned", label: "Assigned", match: (row) => isActive(row) && row.status !== "open" },
  { value: "resolved", label: "Resolved", match: isResolved },
];

function ComplaintsScreen({ navigation }) {
  const { permissions } = useMyPermissions();
  const isAssigner = can(permissions, "complaints", "assign") || can(permissions, "complaints", "view_all");
  const complaints = useServerData(async () => (await listComplaints()).data.data, { initialData: [] });
  const [filter, setFilter] = useState("all");

  const rows = complaints.data || [];
  const open = (row) => navigation.navigate(SCREENS.COMPLAINT_DETAIL, { ticketId: row._id });

  let sections;
  if (isAssigner) {
    const match = FILTERS.find((f) => f.value === filter).match;
    sections = [{ key: "list", rows: rows.filter(match) }];
  } else {
    sections = [
      { key: "active", rows: rows.filter(isActive) },
      { key: "resolved", title: "Resolved", rows: rows.filter(isResolved).slice(0, 10) },
    ];
  }
  const shownCount = sections.reduce((sum, section) => sum + section.rows.length, 0);

  return (
    <Screen onRefresh={complaints.refetch} refreshing={complaints.isRefreshing} testID="complaints-screen">
      <ScreenHeader
        title={isAssigner ? "Complaints" : "My complaints"}
        subtitle={isAssigner ? "From the public complaint form" : "Assigned to you"}
        onBack={() => navigation.goBack()}
      />

      {isAssigner ? (
        <>
          <ShareComplaintLink />
          <View style={styles.filters}>
            <SegmentedControl
              options={FILTERS.map((f) => ({ value: f.value, label: `${f.label} (${rows.filter(f.match).length})` }))}
              value={filter}
              onChange={setFilter}
              testID="complaint-filter"
            />
          </View>
        </>
      ) : null}

      <ListState
        isLoading={complaints.isLoading}
        error={complaints.error}
        onRetry={complaints.refetch}
        isEmpty={shownCount === 0}
        emptyText={isAssigner ? (filter === "unassigned" ? "Nothing waiting — everything is assigned." : "Nothing here.") : "No complaints assigned to you."}
        skeleton="service"
        testID="complaints-list"
      />

      {sections.map((section) =>
        section.rows.length > 0 ? (
          <View key={section.key}>
            {section.title ? <Text style={[typography.label, styles.section]}>{section.title}</Text> : null}
            {section.rows.map((row) => (
              <ComplaintRow key={row._id} row={row} onPress={() => open(row)} />
            ))}
          </View>
        ) : null
      )}
    </Screen>
  );
}

function ComplaintRow({ row, onPress }) {
  const unassigned = row.status === "open";
  const priority = PRIORITY[row.priority];
  const overdue = isVisitOverdue(row);

  return (
    <Card onPress={onPress} style={unassigned && styles.unassigned} testID={`complaint-row-${row._id}`}>
      <View style={styles.header}>
        <Text style={[typography.body, styles.name]} numberOfLines={1}>
          {row.number} · {row.customerName || row.companyName || row.contactName || "Customer"}
        </Text>
        <StatusPill label={STATUS_LABEL[row.status] || row.status} tone={STATUS_TONE[row.status]} testID={unassigned ? `complaint-unassigned-${row._id}` : undefined} />
      </View>
      <Text style={[typography.body, styles.line]} numberOfLines={1}>
        {row.description}
      </Text>
      <View style={styles.footer}>
        <Text style={[typography.small, styles.meta]} numberOfLines={1}>
          {row.contactPhone} · {timeAgo(row.createdAt)}
          {row.assigneeName ? ` · ${row.assigneeName}` : ""}
          {row.visitDate ? ` · visit ${formatDate(row.visitDate)}` : ""}
        </Text>
        {priority ? <StatusPill label={priority.label} tone={priority.tone} /> : null}
      </View>
      {overdue ? <Text style={[typography.small, styles.late]}>Visit date has passed</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  filters: { marginBottom: spacing.md },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm },
  name: { flex: 1, fontWeight: "600" },
  line: { marginTop: spacing.xs },
  footer: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm, marginTop: spacing.xs },
  meta: { flex: 1 },
  late: { marginTop: spacing.xs, color: colors.danger, fontWeight: "600" },
  section: { marginTop: spacing.lg, marginBottom: spacing.sm },
  unassigned: { borderLeftWidth: 4, borderLeftColor: colors.danger },
});

export default ComplaintsScreen;
