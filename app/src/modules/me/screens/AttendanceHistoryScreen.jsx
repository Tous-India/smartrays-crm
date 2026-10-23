import { useMemo, useState } from "react";
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
import MonthCalendar, { DAY_KINDS } from "../../attendance/components/MonthCalendar";
import { buildMonthDays, computeAttendanceSummary } from "../../attendance/attendanceSummary";
import { formatDate, formatMonth, formatShortDate, startOfDay } from "../../../utils/date.utils";
import { colors, spacing, typography } from "../../../theme";

/**
 * Attendance history (app-plan.md §1.6): one month at a time, one row per
 * record — the day, check-in and check-out times, the server's working
 * hours and its status. Own photos and coordinates are never shown (§7.4c);
 * nothing is computed here, the rows are `GET /attendance/me` as returned.
 *
 * 2026-10-23: a month calendar on top, each day coloured by its record's
 * status (tap a day for only its rows), and the month's summary — the
 * web's own counting rule (attendanceSummary.js), not a new one.
 */
function shiftMonth(date, delta) {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

/**
 * "Out 12:35", or "Out 12:35 · 19 Sep" when the check-out fell on a later
 * calendar day than the check-in — the time alone would read as earlier
 * than the check-in. Display only; the record is the server's.
 */
export function formatCheckOut(record) {
  const outTime = formatClockTime(record.checkOut.time);
  const sameDay = startOfDay(record.checkOut.time).getTime() === startOfDay(record.checkIn?.time || record.date).getTime();

  return sameDay ? `Out ${outTime}` : `Out ${outTime} · ${formatShortDate(record.checkOut.time)}`;
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
  const [selectedDay, setSelectedDay] = useState(null);
  const weeks = useMemo(() => buildMonthDays(month, records.data), [month, records.data]);
  const summary = useMemo(
    () => computeAttendanceSummary(records.data, { from: month, to: new Date(month.getFullYear(), month.getMonth() + 1, 0) }),
    [month, records.data]
  );
  const selectedRecords = selectedDay ? weeks.flat().find((slot) => slot?.day === selectedDay)?.records ?? [] : null;
  const shown = selectedRecords ?? records.data;

  function changeMonth(delta) {
    setSelectedDay(null);
    setMonth(shiftMonth(month, delta));
  }

  return (
    <Screen onRefresh={records.refetch} refreshing={records.isRefreshing} testID="attendance-history-screen">
      <ScreenHeader title="Attendance history" onBack={() => navigation.goBack()} />

      <View style={styles.monthRow}>
        <Pressable onPress={() => changeMonth(-1)} accessibilityRole="button" accessibilityLabel="Previous month" style={styles.monthButton} testID="history-prev-month">
          <Ionicons name="chevron-back" size={24} color={colors.brandNavy} />
        </Pressable>
        <Text style={[typography.body, styles.monthLabel]} testID="history-month">
          {formatMonth(month)}
        </Text>
        <Pressable
          onPress={() => changeMonth(1)}
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
        skeleton="attendance"
        skeletonCount={4}
        testID="history-list"
      />

      {!records.isLoading && !records.error ? (
        <Card testID="history-month-card">
          <MonthCalendar weeks={weeks} selectedDay={selectedDay} onSelectDay={setSelectedDay} />
          <View style={styles.summary}>
            <Text style={[typography.body, styles.summaryItem]} testID="history-summary-present">
              {summary.present} present
            </Text>
            <Text style={[typography.body, styles.summaryItem]} testID="history-summary-half_day">
              {summary.half_day} half day
            </Text>
            <Text style={[typography.body, styles.summaryItem]} testID="history-summary-absent">
              {summary.absent} absent
            </Text>
            <Text style={[typography.body, styles.summaryItem]} testID="history-summary-on_leave">
              {summary.on_leave} on leave
            </Text>
            <Text style={[typography.body, styles.summaryItem]} testID="history-summary-hours">
              {String(summary.hours)} h worked
            </Text>
          </View>
          {summary.attendanceRate !== null ? (
            <Text style={[typography.small, styles.rate]} testID="history-summary-rate">
              Attendance {summary.attendanceRate}% of {summary.workingDays} working days so far (Monday–Saturday)
            </Text>
          ) : null}
        </Card>
      ) : null}

      {selectedDay ? (
        <Text style={[typography.label, styles.dayHeading]} testID="history-selected-day">
          {formatDate(new Date(month.getFullYear(), month.getMonth(), selectedDay))} — tap the day again for the whole month
        </Text>
      ) : null}

      {!records.isLoading && !records.error
        ? shown.map((record) => (
            <Card key={record._id} testID={`history-row-${record._id}`}>
              <View style={styles.rowHeader}>
                <Text style={[typography.body, styles.day]}>{formatDate(record.date)}</Text>
                {record.status ? <StatusPill label={DAY_KINDS[record.status]?.label ?? record.status} tone={statusTone(record.status)} /> : null}
              </View>
              <Text style={[typography.small, styles.line]}>
                {record.checkIn?.time ? `In ${formatClockTime(record.checkIn.time)}` : "No check-in"}
                {record.checkOut?.time ? ` · ${formatCheckOut(record)}` : record.checkIn?.time ? " · still open" : ""}
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
  summary: { flexDirection: "row", flexWrap: "wrap", columnGap: spacing.lg, rowGap: spacing.xs, marginTop: spacing.md },
  summaryItem: { fontWeight: "600" },
  rate: { marginTop: spacing.xs },
  dayHeading: { marginBottom: spacing.sm },
});

export default AttendanceHistoryScreen;
