import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import Screen from "../../../components/Screen";
import ScreenHeader from "../../../components/ScreenHeader";
import Card from "../../../components/Card";
import ListState from "../../../components/ListState";
import PrimaryButton from "../../../components/PrimaryButton";
import DateField from "../../../components/DateField";
import ErrorBanner from "../../../components/ErrorBanner";
import useServerData from "../../../hooks/useServerData";
import { assignComplaint, getComplaint, listComplaintAssignees } from "../api/complaintApi";
import { PRIORITIES } from "../complaints.utils";
import { messageFromError } from "../../../utils/apiError.utils";
import { startOfDay, toDateKey } from "../../../utils/date.utils";
import { colors, radius, spacing, typography } from "../../../theme";

/**
 * Assign / reassign a complaint (2026-10-23) — who goes, how urgent, which
 * day. Big taps, no typing: a person from the staff list, one of four
 * priorities, Today / Tomorrow or a picked date. The server tells the
 * technician who assigned it.
 */
function plusDays(days) {
  const day = startOfDay(new Date());
  day.setDate(day.getDate() + days);
  return day;
}

function Choice({ label, selected, onPress, testID }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={[styles.choice, selected && styles.choiceSelected]}
      testID={testID}
    >
      <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{label}</Text>
    </Pressable>
  );
}

function AssignComplaintScreen({ navigation, route }) {
  const { ticketId } = route.params;
  const complaint = useServerData(async () => (await getComplaint(ticketId)).data.data, { deps: [ticketId] });
  const people = useServerData(async () => (await listComplaintAssignees()).data.data, { initialData: [] });
  const [assignedToId, setAssignedToId] = useState(null);
  const [priority, setPriority] = useState("medium");
  const [visitDay, setVisitDay] = useState(null);
  const [problem, setProblem] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  // Start from what it has now, when reassigning.
  useEffect(() => {
    const record = complaint.data;
    if (!record) return;
    if (record.assignedTo) setAssignedToId(record.assignedTo._id);
    if (record.priority) setPriority(record.priority);
    if (record.visitDate) setVisitDay(new Date(`${record.visitDate}T00:00:00`));
  }, [complaint.data]);

  async function save() {
    if (!assignedToId) return setProblem("Choose who should go.");
    if (!visitDay) return setProblem("Choose a visit date.");
    setProblem(null);
    setIsSaving(true);
    try {
      await assignComplaint(ticketId, { assignedToId, priority, visitDate: toDateKey(visitDay) });
      navigation.goBack();
    } catch (error) {
      setProblem(messageFromError(error));
    } finally {
      setIsSaving(false);
    }
    return undefined;
  }

  const record = complaint.data;
  const isSameDay = (a, b) => Boolean(a && b) && toDateKey(a) === toDateKey(b);

  return (
    <Screen testID="assign-complaint-screen">
      <ScreenHeader
        title={record?.assignedTo ? "Reassign complaint" : "Assign complaint"}
        subtitle={record ? `${record.number} · ${record.contactName || "Customer"}` : undefined}
        onBack={() => navigation.goBack()}
      />

      <Text style={[typography.label, styles.section]}>Who should go?</Text>
      <ListState isLoading={people.isLoading} error={people.error} onRetry={people.refetch} isEmpty={(people.data || []).length === 0} emptyText="No staff found." skeleton="service" testID="assignees" />
      {(people.data || []).map((person) => {
        const selected = assignedToId === person._id;
        return (
          <Card key={person._id} onPress={() => setAssignedToId(person._id)} style={selected && styles.personSelected} testID={`assignee-${person._id}`}>
            <View style={styles.personRow}>
              <Text style={[typography.body, styles.personName]}>{person.name}</Text>
              <Ionicons name={selected ? "radio-button-on" : "radio-button-off"} size={22} color={selected ? colors.brandNavy : colors.textSecondary} />
            </View>
          </Card>
        );
      })}

      <Text style={[typography.label, styles.section]}>Priority</Text>
      <View style={styles.row}>
        {PRIORITIES.map((p) => (
          <Choice key={p.value} label={p.label} selected={priority === p.value} onPress={() => setPriority(p.value)} testID={`priority-${p.value}`} />
        ))}
      </View>

      <Text style={[typography.label, styles.section]}>Visit date</Text>
      <View style={styles.row}>
        <Choice label="Today" selected={isSameDay(visitDay, plusDays(0))} onPress={() => setVisitDay(plusDays(0))} testID="visit-today" />
        <Choice label="Tomorrow" selected={isSameDay(visitDay, plusDays(1))} onPress={() => setVisitDay(plusDays(1))} testID="visit-tomorrow" />
      </View>
      <DateField label="Or pick a day" value={visitDay} onChange={setVisitDay} minimumDate={plusDays(0)} testID="visit-pick" />

      <ErrorBanner message={problem} testID="assign-error" />
      <PrimaryButton title="Assign" onPress={save} loading={isSaving} disabled={isSaving} style={styles.save} testID="assign-save" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: spacing.lg, marginBottom: spacing.sm },
  personRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm },
  personName: { flex: 1, fontWeight: "600" },
  personSelected: { borderWidth: 2, borderColor: colors.brandNavy },
  row: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.sm },
  choice: {
    flexGrow: 1,
    minWidth: 72,
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.card,
  },
  choiceSelected: { borderColor: colors.brandNavy, borderWidth: 2, backgroundColor: "#e8eef8" },
  choiceText: { fontSize: 15, fontWeight: "600", color: colors.textPrimary },
  choiceTextSelected: { color: colors.brandNavy },
  save: { marginTop: spacing.lg },
});

export default AssignComplaintScreen;
