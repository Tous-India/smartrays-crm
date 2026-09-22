import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import Screen from "../../../components/Screen";
import ScreenHeader from "../../../components/ScreenHeader";
import TextField from "../../../components/TextField";
import DateField from "../../../components/DateField";
import PrimaryButton from "../../../components/PrimaryButton";
import ErrorBanner from "../../../components/ErrorBanner";
import ListState from "../../../components/ListState";
import OfflineNote from "../../../components/OfflineNote";
import useServerData from "../../../hooks/useServerData";
import useIsOnline from "../../../hooks/useIsOnline";
import { createService, listAssignees, updateService } from "../api/teamApi";
import { messageFromError } from "../../../utils/apiError.utils";
import { colors, radius, spacing, typography } from "../../../theme";

/**
 * Assign a service (app-plan.md §2), or edit / reassign one: title,
 * description, due date, subtasks and the assignee — a picker fed ONLY by
 * `GET /services/assignees`, the server's own list of who this caller may
 * assign to. Create is `POST /services`; edit is `PATCH /services/:id`
 * (never the status — that has its own endpoint). The server validates and
 * its refusal is shown word for word.
 *
 * `route.params.service` is the record to edit; absent, this creates.
 */
function ServiceFormScreen({ navigation, route }) {
  const editing = route.params?.service || null;
  const isOnline = useIsOnline();
  const assignees = useServerData(async () => (await listAssignees()).data.data, { initialData: null });
  const [title, setTitle] = useState(editing?.title || "");
  const [description, setDescription] = useState(editing?.description || "");
  const [dueDate, setDueDate] = useState(editing?.dueDate ? new Date(editing.dueDate) : null);
  const [assignedToId, setAssignedToId] = useState(editing?.assignedToId ? String(editing.assignedToId) : null);
  const [subtasks, setSubtasks] = useState(editing?.subtasks?.map((subtask) => ({ title: subtask.title, isDone: subtask.isDone })) || []);
  const [fieldErrors, setFieldErrors] = useState({});
  const [serverError, setServerError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // A field's own message goes away the moment the field is filled in.
  function clearFieldError(field) {
    setFieldErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
  }

  function handleTitleChange(text) {
    setTitle(text);
    clearFieldError("title");
  }

  function handleAssigneeChange(id) {
    setAssignedToId(id);
    clearFieldError("assignedToId");
  }

  function setSubtaskTitle(index, text) {
    setSubtasks((current) => current.map((subtask, i) => (i === index ? { ...subtask, title: text } : subtask)));
  }

  function removeSubtask(index) {
    setSubtasks((current) => current.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    if (isSubmitting) {
      return;
    }

    const errors = {};

    if (!title.trim()) {
      errors.title = "A title is required";
    }

    if (!assignedToId) {
      errors.assignedToId = "Choose who does this";
    }

    setFieldErrors(errors);
    setServerError(null);

    if (Object.keys(errors).length > 0) {
      return;
    }

    const payload = {
      title: title.trim(),
      description: description.trim(),
      assignedToId,
      dueDate: dueDate ? dueDate.toISOString() : null,
      subtasks: subtasks.filter((subtask) => subtask.title.trim()).map((subtask) => ({ title: subtask.title.trim(), isDone: Boolean(subtask.isDone) })),
    };

    setIsSubmitting(true);

    try {
      if (editing) {
        await updateService(editing._id, payload);
      } else {
        await createService(payload);
      }

      navigation.goBack();
    } catch (error) {
      setServerError(messageFromError(error));
      setIsSubmitting(false);
    }
  }

  return (
    <Screen testID="service-form-screen">
      <ScreenHeader title={editing ? "Edit service" : "Assign a service"} onBack={() => navigation.goBack()} />

      <ErrorBanner message={serverError} testID="service-form-error" />

      <TextField label="Title" value={title} onChangeText={handleTitleChange} error={fieldErrors.title} placeholder="What needs doing" autoCapitalize="sentences" testID="service-form-title" />
      <TextField
        label="Description"
        value={description}
        onChangeText={setDescription}
        placeholder="Where, what, anything they need to know (optional)"
        multiline
        numberOfLines={3}
        autoCapitalize="sentences"
        style={styles.multiline}
        testID="service-form-description"
      />
      <DateField label="Due date" value={dueDate} onChange={setDueDate} testID="service-form-due" />

      <Text style={[typography.label, styles.sectionLabel]}>Assign to</Text>
      <ListState isLoading={assignees.isLoading} error={assignees.error} isEmpty={Boolean(assignees.data) && assignees.data.length === 0} emptyText="No one you can assign to." onRetry={assignees.refetch} testID="service-form-assignees" />
      {assignees.data
        ? assignees.data.map((person) => {
            const isSelected = String(person._id) === assignedToId;

            return (
              <Pressable
                key={person._id}
                onPress={() => handleAssigneeChange(String(person._id))}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected }}
                style={[styles.option, isSelected && styles.optionSelected]}
                testID={`service-form-assignee-${person._id}`}
              >
                <Ionicons name={isSelected ? "radio-button-on" : "radio-button-off"} size={22} color={isSelected ? colors.brandNavy : colors.textSecondary} />
                <Text style={[typography.body, styles.optionText]}>
                  {person.name}
                  {person.role ? <Text style={typography.small}> · {person.role}</Text> : null}
                </Text>
              </Pressable>
            );
          })
        : null}
      {fieldErrors.assignedToId ? <Text style={styles.fieldError}>{fieldErrors.assignedToId}</Text> : null}

      <Text style={[typography.label, styles.sectionLabel]}>Subtasks</Text>
      {subtasks.map((subtask, index) => (
        <View key={index} style={styles.subtaskRow}>
          <TextField
            value={subtask.title}
            onChangeText={(text) => setSubtaskTitle(index, text)}
            placeholder={`Subtask ${index + 1}`}
            autoCapitalize="sentences"
            containerStyle={styles.subtaskField}
            testID={`service-form-subtask-${index}`}
          />
          <Pressable onPress={() => removeSubtask(index)} accessibilityRole="button" accessibilityLabel={`Remove subtask ${index + 1}`} style={styles.remove} testID={`service-form-subtask-remove-${index}`}>
            <Ionicons name="close-circle-outline" size={24} color={colors.textSecondary} />
          </Pressable>
        </View>
      ))}
      <Pressable onPress={() => setSubtasks((current) => [...current, { title: "", isDone: false }])} accessibilityRole="button" style={styles.add} testID="service-form-add-subtask">
        <Ionicons name="add-circle-outline" size={22} color={colors.brandNavy} />
        <Text style={[typography.body, styles.addText]}>Add a subtask</Text>
      </Pressable>

      <PrimaryButton title={editing ? "Save changes" : "Assign"} onPress={handleSubmit} loading={isSubmitting} disabled={!isOnline} style={styles.submit} testID="service-form-submit" />
      {!isOnline ? <OfflineNote what={editing ? "saving a service" : "assigning a service"} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  multiline: { minHeight: 88, textAlignVertical: "top" },
  sectionLabel: { marginBottom: spacing.sm },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    marginBottom: spacing.sm,
    minHeight: 48,
  },
  optionSelected: { borderColor: colors.brandNavy },
  optionText: { flex: 1 },
  fieldError: { ...typography.small, color: colors.danger, marginBottom: spacing.md },
  subtaskRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  subtaskField: { flex: 1, marginBottom: spacing.sm },
  remove: { width: 44, height: 48, alignItems: "center", justifyContent: "center" },
  add: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm, marginBottom: spacing.lg, minHeight: 44 },
  addText: { color: colors.brandNavy, fontWeight: "600" },
  submit: { marginTop: spacing.sm },
});

export default ServiceFormScreen;
