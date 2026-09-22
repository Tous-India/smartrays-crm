import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import TeamMap from "./TeamMap";
import Card from "../../../components/Card";
import ListState from "../../../components/ListState";
import PrimaryButton from "../../../components/PrimaryButton";
import { formatAgo, isStale } from "../team.utils";
import { formatClockTime } from "../../attendance/attendance.utils";
import { colors, spacing, typography } from "../../../theme";

/**
 * The Team Map segment: every direct report with a live position as a
 * marker (stale ones grey, per the server's threshold), the people on
 * shift without any position named beneath it, and — once a marker is
 * tapped — a card with the name, the last update and the way into their
 * day.
 */
export function markersFrom(team) {
  const nameById = new Map(team.reports.map((person) => [String(person._id), person.name]));

  return (team.live?.entries || [])
    .filter((entry) => nameById.has(String(entry.employeeId)))
    .map((entry) => ({
      id: String(entry.employeeId),
      name: nameById.get(String(entry.employeeId)),
      coords: entry.coords,
      capturedAt: entry.capturedAt,
      stale: isStale(entry.capturedAt, team.staleAfterMinutes),
    }));
}

function TeamMapSection({ team, onOpenPerson }) {
  const [selected, setSelected] = useState(null);

  if (team.isLoading || team.error || !team.data) {
    return <ListState isLoading={team.isLoading} error={team.error} onRetry={team.refetch} testID="team-map" />;
  }

  const markers = markersFrom(team.data);
  const silent = team.data.roster.filter((row) => row.status === "silent");
  const onShift = team.data.live?.openShiftCount || 0;

  return (
    <View style={styles.wrap}>
      <TeamMap markers={markers} selectedId={selected?.id} onSelect={setSelected} style={styles.map} />

      {markers.length === 0 ? (
        <Text style={[typography.subtitle, styles.note]} testID="team-map-empty">
          {onShift === 0 ? "No one is on shift right now." : "On shift, but no position reported yet."}
        </Text>
      ) : null}

      {silent.length > 0 ? (
        <Text style={[typography.small, styles.silent]} testID="team-map-silent">
          Silent: {silent.map((row) => `${row.person.name}${row.lastSeenAt ? ` (${formatAgo(row.lastSeenAt)})` : ""}`).join(", ")}
        </Text>
      ) : null}

      {selected ? (
        <Card style={styles.selected} testID="team-map-selected">
          <Text style={[typography.body, styles.selectedName]}>{selected.name}</Text>
          <Text style={[typography.small, selected.stale && styles.stale]}>
            {selected.stale ? "STALE — " : ""}last update {formatClockTime(selected.capturedAt)} · {formatAgo(selected.capturedAt)} ago
          </Text>
          <PrimaryButton
            title="Open their day"
            onPress={() => onOpenPerson(team.data.roster.find((row) => String(row.person._id) === selected.id))}
            style={styles.button}
            testID="team-map-open-day"
          />
        </Card>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  map: { minHeight: 320 },
  note: { marginTop: spacing.md, textAlign: "center" },
  silent: { marginTop: spacing.md, color: colors.danger },
  selected: { marginTop: spacing.md, marginBottom: 0 },
  selectedName: { fontWeight: "600" },
  stale: { color: colors.danger },
  button: { marginTop: spacing.md },
});

export default TeamMapSection;
