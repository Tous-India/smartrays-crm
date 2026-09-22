import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import Screen from "../../../components/Screen";
import ScreenHeader from "../../../components/ScreenHeader";
import Card from "../../../components/Card";
import StatusPill from "../../../components/StatusPill";
import ListState from "../../../components/ListState";
import useServerData from "../../../hooks/useServerData";
import { getMyAttendance } from "../../attendance/api/attendanceApi";
import { formatClockTime, monthKey } from "../../attendance/attendance.utils";
import { formatDate, formatMonth } from "../../../utils/date.utils";
import { colors, spacing, typography } from "../../../theme";

/**
 * Attendance history (app-plan.md §1.6): one month at a time, one row per
 * record — the day, check-in and check-out times, the server's working
 * hours and its status. Own photos and coordinates are never shown (§7.4c);
 * nothing is computed here, the rows are `GET /attendance/me` as returned.
 */
function shiftMonth(date, delta) {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

function statusTone(status) {
  if (status === "present") {
    return "success";
  }

  if (status === "absent" || status === "unapproved_absence") {
    return "danger";
  }

  return "neutral";
}

function AttendanceHistoryScreen({ navigation }) {
  const [month, setMonth] = useState(() => shiftMonth(new Date(), 0));
  const key = monthKey(month);
  const records = useServerData(
    async () => {
      const rows = (await getMyAttendance(key)).data.data;

      return [...rows].sort((a, b) => new Date(b.date) - new Date(a.date));
    },
    { initialData: [], deps: [key] }
  );
  const isCurrentMonth = key === monthKey(new Date());

  return (
    <Screen onRefresh={records.refetch} refreshing={records.isRefreshing} testID="attendance-history-screen">
      <ScreenHeader title="Attendance history" onBack={() => navigation.goBack()} />

      <View style={styles.monthRow}>
        <Pressable onPress={() => setMonth(shiftMonth(month, -1))} accessibilityRole="button" accessibilityLabel="Previous month" style={styles.monthButton} testID="history-prev-month">
          <Ionicons name="chevron-back" size={24} color={colors.brandNavy} />
        </Pressable>
        <Text style={[typography.body, styles.monthLabel]} testID="history-month">
          {formatMonth(month)}
        </Text>
        <Pressable
          onPress={() => setMonth(shiftMonth(month, 1))}
          disabled={isCurrentMonth}
          accessibilityRole="button"
          accessibilityLabel="Next month"
          accessibilityState={{ disabled: isCurrentMonth }}
          style={[styles.monthButton, isCurrentMonth && styles.monthButtonDisabled]}
          testID="history-next-month"
        >
          <Ionicons name="chevron-forward" size={24} color={colors.brandNavy} />
        </Pressable>
      </View>

      <ListState
        isLoading={records.isLoading}
        error={records.error}
        isEmpty={records.data.length === 0}
        emptyText={`No attendance recorded in ${formatMonth(month)}.`}
        onRetry={records.refetch}
        testID="history-list"
      />

      {!records.isLoading && !records.error
        ? records.data.map((record) => (
            <Card key={record._id} testID={`history-row-${record._id}`}>
              <View style={styles.rowHeader}>
                <Text style={[typography.body, styles.day]}>{formatDate(record.date)}</Text>
                {record.status ? <StatusPill label={record.status} tone={statusTone(record.status)} /> : null}
              </View>
              <Text style={[typography.small, styles.line]}>
                {record.checkIn?.time ? `In ${formatClockTime(record.checkIn.time)}` : "No check-in"}
                {record.checkOut?.time ? ` · Out ${formatClockTime(record.checkOut.time)}` : record.checkIn?.time ? " · still open" : ""}
                {typeof record.workingHours === "number" ? ` · ${record.workingHours.toFixed(2)} h` : ""}
              </Text>
            </Card>
          ))
        : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  monthRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.lg },
  monthButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  monthButtonDisabled: { opacity: 0.3 },
  monthLabel: { fontWeight: "600", fontSize: 16 },
  rowHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm },
  day: { fontWeight: "600" },
  line: { marginTop: spacing.xs },
});

export default AttendanceHistoryScreen;
