import { Image, StyleSheet, Text, View } from "react-native";
import Screen from "../../../components/Screen";
import ScreenHeader from "../../../components/ScreenHeader";
import Card from "../../../components/Card";
import StatusPill from "../../../components/StatusPill";
import ListState from "../../../components/ListState";
import useTeamToday from "../hooks/useTeamToday";
import { TEAM_STATUS, TEAM_STATUS_LABELS, formatAgo } from "../team.utils";
import { formatClockTime } from "../../attendance/attendance.utils";
import { formatDate } from "../../../utils/date.utils";
import { colors, radius, spacing, typography } from "../../../theme";

/**
 * One direct report's day (app-plan.md §2): today's check-in and check-out
 * times, the photos when the server released them — `photoUrl` is signed
 * only for a caller holding attendance.view_photos, otherwise null, and the
 * app shows what it gets — the server's working hours and status, and the
 * time of the last known position. Coordinates are not shown here; the map
 * is where positions live.
 */
const TONES = {
  [TEAM_STATUS.SILENT]: "danger",
  [TEAM_STATUS.CHECKED_IN]: "success",
  [TEAM_STATUS.CHECKED_OUT]: "neutral",
  [TEAM_STATUS.ON_LEAVE]: "warning",
  [TEAM_STATUS.NOT_CHECKED_IN]: "neutral",
};

function Moment({ label, moment, testID }) {
  if (!moment?.time) {
    return <Row label={label} value="—" testID={testID} />;
  }

  return (
    <>
      <Row label={label} value={formatClockTime(moment.time)} testID={testID} />
      {moment.photoUrl ? <Image source={{ uri: moment.photoUrl }} style={styles.photo} accessibilityLabel={`${label} photo`} testID={`${testID}-photo`} /> : null}
    </>
  );
}

function Row({ label, value, testID }) {
  return (
    <>
      <Text style={[typography.label, styles.rowLabel]}>{label}</Text>
      <Text style={typography.body} testID={testID}>
        {value}
      </Text>
    </>
  );
}

function TeamMemberDayScreen({ navigation, route }) {
  const { employeeId, name } = route.params;
  const team = useTeamToday();
  const row = team.data?.roster.find((candidate) => String(candidate.person._id) === String(employeeId)) || null;

  return (
    <Screen onRefresh={team.refetch} refreshing={team.isRefreshing} testID="team-member-day-screen">
      <ScreenHeader title={name} subtitle={`Today, ${formatDate(new Date())}`} onBack={() => navigation.goBack()} />

      <ListState
        isLoading={team.isLoading}
        error={team.error}
        isEmpty={Boolean(team.data) && !row}
        emptyText="This person is not on your team."
        onRetry={team.refetch}
        skeleton="team"
        skeletonCount={1}
        testID="team-member-day"
      />

      {row ? (
        <Card>
          <View style={styles.pills}>
            <StatusPill label={TEAM_STATUS_LABELS[row.status]} tone={TONES[row.status]} testID="team-member-status" />
            {row.record?.status ? <StatusPill label={row.record.status} /> : null}
          </View>
          <Moment label="Check-in" moment={row.record?.checkIn} testID="team-member-check-in" />
          <Moment label="Check-out" moment={row.record?.checkOut} testID="team-member-check-out" />
          {typeof row.record?.workingHours === "number" ? <Row label="Working hours" value={`${row.record.workingHours.toFixed(2)} h`} /> : null}
          <Row
            label="Last known position"
            value={row.lastSeenAt ? `${formatClockTime(row.lastSeenAt)} · ${formatAgo(row.lastSeenAt)} ago` : "None reported today"}
            testID="team-member-last-seen"
          />
          {row.leave ? <Row label="Leave" value={`${row.leave.type} · ${row.leave.status}`} /> : null}
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  pills: { flexDirection: "row", gap: spacing.sm },
  rowLabel: { marginTop: spacing.md, marginBottom: 2 },
  photo: { width: "100%", aspectRatio: 4 / 3, borderRadius: radius.md, marginTop: spacing.sm, backgroundColor: colors.brandPanelAlt },
});

export default TeamMemberDayScreen;
