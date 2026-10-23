import { StyleSheet, Text, View } from "react-native";
import Card from "../../../components/Card";
import { detailLine } from "../live.utils";
import { colors, spacing, typography } from "../../../theme";

/** One person in the team list: colour dot, name, status, what it means, battery warning. */
function LivePersonRow({ person, meta, onPress }) {
  const status = meta[person.status] ?? { label: person.status, color: colors.textSecondary };
  const detail = detailLine(person);
  return (
    <Card onPress={onPress} testID={`live-row-${person.employeeId}`}>
      <View style={styles.row}>
        <View style={[styles.dot, { backgroundColor: status.color }]} />
        <View style={styles.body}>
          <Text style={[typography.body, styles.name]} numberOfLines={1}>
            {person.name}
          </Text>
          <Text style={[typography.small, styles.status]}>{status.label}</Text>
          {detail ? <Text style={typography.small}>{detail}</Text> : null}
          {person.batteryLow ? (
            <Text style={[typography.small, styles.battery]} testID={`live-battery-low-${person.employeeId}`}>
              Battery low · {person.battery} %
            </Text>
          ) : null}
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  dot: { width: 16, height: 16, borderRadius: 8, marginTop: 4 },
  body: { flex: 1 },
  name: { fontWeight: "600" },
  status: { color: colors.textPrimary, fontWeight: "600" },
  battery: { color: "#ad6800", fontWeight: "700" },
});

export default LivePersonRow;
