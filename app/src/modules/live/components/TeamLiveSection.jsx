import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import TeamMap from "../../team/components/TeamMap";
import Card from "../../../components/Card";
import ListState from "../../../components/ListState";
import PrimaryButton from "../../../components/PrimaryButton";
import LiveCounts from "./LiveCounts";
import LivePersonRow from "./LivePersonRow";
import { detailLine } from "../live.utils";
import { formatTime } from "../../../utils/date.utils";
import { colors, spacing, typography } from "../../../theme";

/**
 * Everyone live (2026-10-23) — the main purpose of the app: the counts at the
 * top (tap to filter), everyone with a position on one map in their status's
 * colour, the list with problems first, and a tapped person's card: status,
 * since when, battery, last update, and their day.
 *
 * `live` is GET /location/live-status through useServerData; for an admin it
 * is everyone, for a manager their team (the server decides).
 */
const ON_MAP = ["moving", "stationary", "at_site", "offline", "location_off", "disconnected"];

export function markersFromLive(people, meta) {
  return people
    .filter((person) => person.coords && ON_MAP.includes(person.status))
    .map((person) => ({
      id: String(person.employeeId),
      name: person.name,
      coords: person.coords,
      capturedAt: person.lastPingAt,
      color: meta[person.status]?.color,
      stale: person.status === "offline" || person.status === "disconnected",
    }));
}

function TeamLiveSection({ live, meta, onOpenPerson }) {
  const [filter, setFilter] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  if (live.isLoading || live.error || !live.data) {
    return <ListState isLoading={live.isLoading} error={live.error} onRetry={live.refetch} testID="team-live" />;
  }

  const people = live.data.people;
  const shown = filter ? people.filter((person) => person.status === filter) : people;
  const markers = markersFromLive(shown, meta);
  const selected = people.find((person) => String(person.employeeId) === selectedId) ?? null;
  const selectedStatus = selected ? meta[selected.status] : null;

  return (
    <View testID="team-live">
      <LiveCounts counts={live.data.counts} meta={meta} filter={filter} onFilter={setFilter} />
      <TeamMap markers={markers} selectedId={selectedId} onSelect={(marker) => setSelectedId(marker.id)} style={styles.map} />

      {selected ? (
        <Card style={styles.selected} testID="team-live-selected">
          <Text style={[typography.body, styles.bold]}>{selected.name}</Text>
          <Text style={[typography.body, styles.bold, { color: selectedStatus?.color ?? colors.textPrimary }]}>
            {selectedStatus?.label ?? selected.status}
            {selected.since ? ` since ${formatTime(selected.since)}` : ""}
          </Text>
          {detailLine(selected) ? <Text style={typography.small}>{detailLine(selected)}</Text> : null}
          {typeof selected.battery === "number" ? (
            <Text style={[typography.small, selected.batteryLow && styles.warn]}>
              Battery {selected.battery} %{selected.charging ? " (charging)" : ""}
            </Text>
          ) : null}
          {selected.lastPingAt ? <Text style={typography.small}>Last update {formatTime(selected.lastPingAt)}</Text> : null}
          <PrimaryButton title="Open their day" onPress={() => onOpenPerson(selected)} style={styles.button} testID="team-live-open-day" />
        </Card>
      ) : null}

      <Text style={[typography.label, styles.section]}>{filter ? meta[filter]?.label : "Everyone — problems first"}</Text>
      {shown.length === 0 ? (
        <Text style={[typography.subtitle, styles.empty]} testID="team-live-empty">
          {filter ? "Nobody in this state right now." : "No one on the team yet."}
        </Text>
      ) : (
        shown.map((person) => (
          <LivePersonRow key={String(person.employeeId)} person={person} meta={meta} onPress={() => setSelectedId(String(person.employeeId))} />
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  map: { minHeight: 300, marginTop: spacing.sm },
  selected: { marginTop: spacing.md },
  bold: { fontWeight: "600" },
  warn: { color: "#ad6800", fontWeight: "700" },
  button: { marginTop: spacing.md },
  section: { marginTop: spacing.lg, marginBottom: spacing.sm },
  empty: { textAlign: "center", marginVertical: spacing.lg, color: colors.textSecondary },
});

export default TeamLiveSection;
