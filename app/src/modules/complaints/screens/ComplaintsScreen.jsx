import { StyleSheet, Text, View } from "react-native";
import Screen from "../../../components/Screen";
import ScreenHeader from "../../../components/ScreenHeader";
import Card from "../../../components/Card";
import StatusPill from "../../../components/StatusPill";
import ListState from "../../../components/ListState";
import useServerData from "../../../hooks/useServerData";
import useSessionStore from "../../../store/sessionStore";
import { listComplaints } from "../api/complaintApi";
import { CATEGORY_LABEL, STATUS_LABEL, STATUS_TONE, isActive, overdueText, sortForWork, timeAgo } from "../complaints.utils";
import { SCREENS } from "../../../constants/screens.constants";
import { colors, spacing, typography } from "../../../theme";

/**
 * "My complaints" (2026-10-22): customer complaints assigned to the person
 * holding the phone — the ones still to do on top, overdue first, then the
 * resolved ones. The server's list for a manager or admin holds everyone's;
 * this screen is about "mine", like the Home card. Tap → the complaint.
 */
function ComplaintsScreen({ navigation }) {
  const user = useSessionStore((state) => state.user);
  const complaints = useServerData(
    async () => (await listComplaints()).data.data.filter((ticket) => String(ticket.assignedToId) === String(user?._id)),
    { initialData: [], deps: [user?._id] }
  );

  const sorted = sortForWork(complaints.data || []);
  const active = sorted.filter(isActive);
  const done = sorted.filter((ticket) => !isActive(ticket)).slice(0, 10);

  return (
    <Screen onRefresh={complaints.refetch} refreshing={complaints.isRefreshing} testID="complaints-screen">
      <ScreenHeader title="My complaints" subtitle="From customers' complaint links" onBack={() => navigation.goBack()} />

      <ListState
        isLoading={complaints.isLoading}
        error={complaints.error}
        onRetry={complaints.refetch}
        isEmpty={sorted.length === 0}
        emptyText="No complaints assigned to you."
        skeleton="service"
        testID="complaints-list"
      />

      {active.map((ticket) => (
        <ComplaintRow key={ticket._id} ticket={ticket} onPress={() => navigation.navigate(SCREENS.COMPLAINT_DETAIL, { ticketId: ticket._id })} />
      ))}

      {done.length > 0 ? <Text style={[typography.label, styles.section]}>Resolved</Text> : null}
      {done.map((ticket) => (
        <ComplaintRow key={ticket._id} ticket={ticket} onPress={() => navigation.navigate(SCREENS.COMPLAINT_DETAIL, { ticketId: ticket._id })} />
      ))}
    </Screen>
  );
}

function ComplaintRow({ ticket, onPress }) {
  const late = overdueText(ticket);

  return (
    <Card onPress={onPress} testID={`complaint-row-${ticket._id}`}>
      <View style={styles.header}>
        <Text style={[typography.body, styles.name]} numberOfLines={1}>
          {ticket.number ? `${ticket.number} · ` : ""}
          {ticket.customerName || "Customer"}
        </Text>
        <StatusPill label={STATUS_LABEL[ticket.status] || ticket.status} tone={STATUS_TONE[ticket.status]} />
      </View>
      <Text style={[typography.small, styles.line]}>
        {CATEGORY_LABEL[ticket.category] || "Complaint"} · {timeAgo(ticket.createdAt)}
      </Text>
      {late ? (
        <Text style={[typography.small, styles.late]} testID={`complaint-late-${ticket._id}`}>
          {late}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm },
  name: { flex: 1, fontWeight: "600" },
  line: { marginTop: spacing.xs },
  late: { marginTop: spacing.xs, color: colors.danger, fontWeight: "600" },
  section: { marginTop: spacing.lg, marginBottom: spacing.sm },
});

export default ComplaintsScreen;
