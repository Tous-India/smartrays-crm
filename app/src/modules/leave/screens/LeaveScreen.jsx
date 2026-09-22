import { StyleSheet, Text, View } from "react-native";
import Screen from "../../../components/Screen";
import ScreenHeader from "../../../components/ScreenHeader";
import Card from "../../../components/Card";
import StatusPill from "../../../components/StatusPill";
import ListState from "../../../components/ListState";
import PrimaryButton from "../../../components/PrimaryButton";
import OfflineNote from "../../../components/OfflineNote";
import useServerData from "../../../hooks/useServerData";
import useIsOnline from "../../../hooks/useIsOnline";
import { getLeaveBalance, listMyLeaves } from "../api/leaveApi";
import { formatLeaveSpan, statusTone } from "../leave.utils";
import { SCREENS } from "../../../constants/screens.constants";
import { messageFromError } from "../../../utils/apiError.utils";
import { colors, spacing, typography } from "../../../theme";

/**
 * Leave (app-plan.md §1.6): this month's paid-leave balance as the server
 * counts it, the way in to a new request, and every request the caller has
 * made with its status. Nothing here computes a balance or a rule — the
 * figures are `GET /leave/balance`'s, the statuses `GET /leave`'s.
 */
function LeaveScreen({ navigation }) {
  const isOnline = useIsOnline();
  const balance = useServerData(async () => (await getLeaveBalance()).data.data);
  const leaves = useServerData(async () => (await listMyLeaves()).data.data, { initialData: [] });

  function refetchAll() {
    balance.refetch();
    leaves.refetch();
  }

  return (
    <Screen onRefresh={refetchAll} refreshing={balance.isRefreshing || leaves.isRefreshing} testID="leave-screen">
      <ScreenHeader title="Leave" subtitle="Your balance and requests" />

      <Card testID="leave-balance-card">
        <Text style={typography.label}>Paid leave this month</Text>
        {balance.isLoading ? (
          <Text style={[typography.subtitle, styles.line]}>Loading…</Text>
        ) : balance.error ? (
          <Text style={[typography.small, styles.line, styles.danger]} testID="leave-balance-error">
            {messageFromError(balance.error)}
          </Text>
        ) : (
          <>
            <Text style={[typography.title, styles.balance]} testID="leave-balance-remaining">
              {balance.data.paidLeaveRemaining} of {balance.data.paidLeaveLimit} left
            </Text>
            <Text style={[typography.subtitle, styles.line]}>{balance.data.paidLeaveUsed} used, as the server counts it</Text>
          </>
        )}
      </Card>

      <PrimaryButton
        title="Apply for leave"
        onPress={() => navigation.navigate(SCREENS.APPLY_LEAVE)}
        disabled={!isOnline}
        testID="leave-apply"
      />
      {!isOnline ? <OfflineNote what="applying for leave" /> : null}

      <Text style={[typography.label, styles.sectionTitle]}>My requests</Text>
      <ListState
        isLoading={leaves.isLoading}
        error={leaves.error}
        isEmpty={leaves.data.length === 0}
        emptyText="No leave requests yet."
        onRetry={leaves.refetch}
        testID="leave-list"
      />
      {!leaves.isLoading && !leaves.error
        ? leaves.data.map((leave) => (
            <Card key={leave._id} testID={`leave-row-${leave._id}`}>
              <View style={styles.rowHeader}>
                <Text style={[typography.body, styles.span]}>{formatLeaveSpan(leave)}</Text>
                <StatusPill label={leave.status} tone={statusTone(leave.status)} testID={`leave-status-${leave._id}`} />
              </View>
              <Text style={[typography.small, styles.line]}>
                {leave.type}
                {leave.reason ? ` · ${leave.reason}` : ""}
              </Text>
              {leave.status === "rejected" && leave.declineReason ? (
                <Text style={[typography.small, styles.line, styles.danger]}>Declined: {leave.declineReason}</Text>
              ) : null}
            </Card>
          ))
        : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  line: { marginTop: spacing.xs },
  balance: { marginTop: spacing.sm },
  danger: { color: colors.danger },
  sectionTitle: { marginTop: spacing.xl, marginBottom: spacing.md },
  rowHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: spacing.sm },
  span: { flex: 1, fontWeight: "600" },
});

export default LeaveScreen;
