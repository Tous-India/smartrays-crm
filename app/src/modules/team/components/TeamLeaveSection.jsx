import { StyleSheet, Text, View } from "react-native";
import Card from "../../../components/Card";
import StatusPill from "../../../components/StatusPill";
import ListState from "../../../components/ListState";
import { formatLeaveSpan, statusTone } from "../../leave/leave.utils";
import { colors, spacing, typography } from "../../../theme";

/**
 * The team's leave requests, view only (app-plan.md §2 as built here: the
 * app shows, the web decides). `leaves` is `GET /leave?scope=team`.
 */
function TeamLeaveSection({ leaves, nameById }) {
  return (
    <>
      <ListState
        isLoading={leaves.isLoading}
        error={leaves.error}
        isEmpty={Boolean(leaves.data) && leaves.data.length === 0}
        emptyText="No leave requests on the team."
        onRetry={leaves.refetch}
        skeleton="leave"
        testID="team-leave"
      />
      {leaves.data && !leaves.error
        ? leaves.data.map((leave) => (
            <Card key={leave._id} testID={`team-leave-row-${leave._id}`}>
              <View style={styles.rowHeader}>
                <Text style={[typography.body, styles.name]}>{nameById.get(String(leave.employeeId)) || "—"}</Text>
                <StatusPill label={leave.status} tone={statusTone(leave.status)} />
              </View>
              <Text style={[typography.small, styles.line]}>
                {formatLeaveSpan(leave)} · {leave.type}
                {leave.reason ? ` · ${leave.reason}` : ""}
              </Text>
            </Card>
          ))
        : null}
      <Text style={[typography.small, styles.footnote]}>Approvals are made on the web.</Text>
    </>
  );
}

const styles = StyleSheet.create({
  rowHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm },
  name: { fontWeight: "600", color: colors.textPrimary, flex: 1 },
  line: { marginTop: spacing.xs },
  footnote: { marginTop: spacing.md, textAlign: "center" },
});

export default TeamLeaveSection;
