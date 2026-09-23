import { StyleSheet, Text, View } from "react-native";
import Card from "../../../components/Card";
import StatusPill from "../../../components/StatusPill";
import ListState from "../../../components/ListState";
import { TEAM_STATUS, TEAM_STATUS_LABELS, formatAgo } from "../team.utils";
import { formatClockTime } from "../../attendance/attendance.utils";
import { colors, spacing, typography } from "../../../theme";

/**
 * Team Today (app-plan.md §2): one row per direct report — silent first,
 * then checked in, checked out, on leave, not checked in — with the
 * check-in time and how long since the last position. Tap a row for the
 * person's day.
 */
const TONES = {
  [TEAM_STATUS.SILENT]: "danger",
  [TEAM_STATUS.CHECKED_IN]: "success",
  [TEAM_STATUS.CHECKED_OUT]: "neutral",
  [TEAM_STATUS.ON_LEAVE]: "warning",
  [TEAM_STATUS.NOT_CHECKED_IN]: "neutral",
};

function detailLine(row) {
  const parts = [];

  if (row.record?.checkIn?.time) {
    parts.push(`In ${formatClockTime(row.record.checkIn.time)}`);
  }

  if (row.record?.checkOut?.time) {
    parts.push(`Out ${formatClockTime(row.record.checkOut.time)}`);
  }

  if (row.status === TEAM_STATUS.SILENT) {
    parts.push(row.lastSeenAt ? `last position ${formatAgo(row.lastSeenAt)} ago` : "no position yet");
  } else if (row.status === TEAM_STATUS.CHECKED_IN && row.lastSeenAt) {
    parts.push(`position ${formatAgo(row.lastSeenAt)} ago`);
  }

  if (row.status === TEAM_STATUS.ON_LEAVE && row.leave) {
    parts.push(`${row.leave.type} leave`);
  }

  return parts.join(" · ");
}

function TeamTodaySection({ team, onOpenPerson }) {
  return (
    <>
      <ListState
        isLoading={team.isLoading}
        error={team.error}
        isEmpty={Boolean(team.data) && team.data.reports.length === 0}
        emptyText="No one reports to you yet."
        onRetry={team.refetch}
        skeleton="team"
        testID="team-today"
      />
      {team.data && !team.error
        ? team.data.roster.map((row) => (
            <Card key={row.person._id} onPress={() => onOpenPerson(row)} testID={`team-row-${row.person._id}`}>
              <View style={styles.rowHeader}>
                <Text style={[typography.body, styles.name]}>{row.person.name}</Text>
                <StatusPill label={TEAM_STATUS_LABELS[row.status]} tone={TONES[row.status]} testID={`team-status-${row.person._id}`} />
              </View>
              <Text style={[typography.small, styles.line]}>{detailLine(row) || "Nothing recorded today"}</Text>
            </Card>
          ))
        : null}
    </>
  );
}

const styles = StyleSheet.create({
  rowHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm },
  name: { fontWeight: "600", color: colors.textPrimary, flex: 1 },
  line: { marginTop: spacing.xs },
});

export default TeamTodaySection;
