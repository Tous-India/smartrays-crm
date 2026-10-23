import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Card from "../../../components/Card";
import StatusPill from "../../../components/StatusPill";
import ListState from "../../../components/ListState";
import PrimaryButton from "../../../components/PrimaryButton";
import TextField from "../../../components/TextField";
import LinkText from "../../../components/LinkText";
import ErrorBanner from "../../../components/ErrorBanner";
import { approveLeave, declineLeave } from "../api/teamApi";
import { formatLeaveSpan, statusTone } from "../../leave/leave.utils";
import { messageFromError } from "../../../utils/apiError.utils";
import { colors, spacing, typography } from "../../../theme";

/**
 * The team's leave requests (`GET /leave?scope=team`). Since 2026-10-23 a
 * manager decides pending ones here too: Approve, or Decline with an optional
 * reason — `canApprove` / `canDecline` are leave.approve / leave.decline, and
 * the server still checks the request belongs to the caller's team. Without
 * them the list stays view only.
 */
function TeamLeaveSection({ leaves, nameById, canApprove = false, canDecline = false, isOnline = true }) {
  const [busy, setBusy] = useState(null);
  const [declining, setDeclining] = useState(null); // leave id
  const [reason, setReason] = useState("");
  const [error, setError] = useState(null);

  async function decide(key, action) {
    setBusy(key);
    setError(null);
    try {
      await action();
      setDeclining(null);
      setReason("");
      await leaves.refetch();
    } catch (actionError) {
      setError(messageFromError(actionError));
    } finally {
      setBusy(null);
    }
  }

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
      <ErrorBanner message={error} testID="team-leave-error" />
      {leaves.data && !leaves.error
        ? leaves.data.map((leave) => {
            const pending = leave.status === "pending";
            return (
              <Card key={leave._id} testID={`team-leave-row-${leave._id}`}>
                <View style={styles.rowHeader}>
                  <Text style={[typography.body, styles.name]}>{nameById.get(String(leave.employeeId)) || "—"}</Text>
                  <StatusPill label={leave.status} tone={statusTone(leave.status)} />
                </View>
                <Text style={[typography.small, styles.line]}>
                  {formatLeaveSpan(leave)} · {leave.type}
                  {leave.reason ? ` · ${leave.reason}` : ""}
                </Text>
                {pending && canApprove && declining !== leave._id ? (
                  <PrimaryButton
                    title="Approve"
                    onPress={() => decide(`approve-${leave._id}`, () => approveLeave(leave._id))}
                    loading={busy === `approve-${leave._id}`}
                    disabled={!isOnline || busy !== null}
                    style={styles.button}
                    testID={`team-leave-approve-${leave._id}`}
                  />
                ) : null}
                {pending && canDecline && declining !== leave._id ? (
                  <View style={styles.declineLink}>
                    <LinkText title="Decline" onPress={() => setDeclining(leave._id)} testID={`team-leave-decline-${leave._id}`} />
                  </View>
                ) : null}
                {pending && canDecline && declining === leave._id ? (
                  <>
                    <TextField
                      label="Reason (optional)"
                      value={reason}
                      onChangeText={setReason}
                      maxLength={300}
                      containerStyle={styles.button}
                      testID={`team-leave-decline-reason-${leave._id}`}
                    />
                    <PrimaryButton
                      title="Decline"
                      onPress={() => decide(`decline-${leave._id}`, () => declineLeave(leave._id, reason.trim() || undefined))}
                      loading={busy === `decline-${leave._id}`}
                      disabled={!isOnline || busy !== null}
                      style={styles.button}
                      testID={`team-leave-decline-confirm-${leave._id}`}
                    />
                  </>
                ) : null}
              </Card>
            );
          })
        : null}
      {!canApprove && !canDecline ? <Text style={[typography.small, styles.footnote]}>Approvals are made on the web.</Text> : null}
    </>
  );
}

const styles = StyleSheet.create({
  rowHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm },
  name: { fontWeight: "600", color: colors.textPrimary, flex: 1 },
  line: { marginTop: spacing.xs },
  button: { marginTop: spacing.md },
  declineLink: { marginTop: spacing.md, alignSelf: "center" },
  footnote: { marginTop: spacing.md, textAlign: "center" },
});

export default TeamLeaveSection;
