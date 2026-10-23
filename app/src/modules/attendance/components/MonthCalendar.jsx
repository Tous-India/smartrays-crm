import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../../../theme";

/**
 * My month at a glance (2026-10-23): one square per day, coloured by the
 * status the server gave that day's record — present green, half day amber,
 * absent red, on leave purple, an open shift blue; Sundays and days with
 * nothing recorded stay plain. Tap a day to see only its records, tap it
 * again for the whole month. `weeks` comes from buildMonthDays.
 */
export const DAY_KINDS = {
  present: { label: "Present", color: "#2f9e44", text: "#ffffff" },
  half_day: { label: "Half day", color: "#f59f00", text: "#ffffff" },
  absent: { label: "Absent", color: "#e03131", text: "#ffffff" },
  on_leave: { label: "On leave", color: "#7048e8", text: "#ffffff" },
  on_shift: { label: "On shift now", color: "#1971c2", text: "#ffffff" },
  none: { label: "Nothing recorded", color: colors.brandPanelAlt, text: colors.textPrimary },
  off: { label: "Sunday (weekly off)", color: "transparent", text: colors.textSecondary },
  future: { label: "", color: "transparent", text: colors.disabled },
};

const LEGEND = ["present", "half_day", "absent", "on_leave", "on_shift"];
const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

function MonthCalendar({ weeks, selectedDay, onSelectDay }) {
  return (
    <View testID="history-calendar">
      <View style={styles.week}>
        {WEEKDAYS.map((name, index) => (
          <Text key={`${name}-${index}`} style={styles.weekday}>
            {name}
          </Text>
        ))}
      </View>
      {weeks.map((week, weekIndex) => (
        <View key={weekIndex} style={styles.week}>
          {week.map((slot, index) => {
            if (!slot) return <View key={`blank-${index}`} style={styles.cell} />;
            const kind = DAY_KINDS[slot.kind];
            const selected = selectedDay === slot.day;
            return (
              <Pressable
                key={slot.day}
                onPress={() => onSelectDay(selected ? null : slot.day)}
                disabled={slot.records.length === 0}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`${slot.day}${kind.label ? ` — ${kind.label}` : ""}`}
                style={styles.cell}
                testID={`history-day-${slot.day}`}
              >
                <View
                  style={[
                    styles.square,
                    { backgroundColor: kind.color },
                    slot.isToday && styles.today,
                    selected && styles.selected,
                  ]}
                >
                  <Text style={[styles.dayText, { color: kind.text }]}>{slot.day}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
      <View style={styles.legend}>
        {LEGEND.map((key) => (
          <View key={key} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: DAY_KINDS[key].color }]} />
            <Text style={typography.small}>{DAY_KINDS[key].label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  week: { flexDirection: "row" },
  weekday: { flex: 1, textAlign: "center", ...typography.small, fontWeight: "600", color: colors.textLabel, marginBottom: spacing.xs },
  cell: { flex: 1, aspectRatio: 1, padding: 3 },
  square: { flex: 1, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  today: { borderWidth: 2, borderColor: colors.brandNavy },
  selected: { borderWidth: 3, borderColor: colors.textPrimary },
  dayText: { fontSize: 15, fontWeight: "600" },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginTop: spacing.sm },
  legendItem: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  legendDot: { width: 12, height: 12, borderRadius: 3 },
});

export default MonthCalendar;
