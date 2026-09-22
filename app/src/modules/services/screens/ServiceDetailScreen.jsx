import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import Screen from "../../../components/Screen";
import ScreenHeader from "../../../components/ScreenHeader";
import Card from "../../../components/Card";
import StatusPill from "../../../components/StatusPill";
import ListState from "../../../components/ListState";
import PrimaryButton from "../../../components/PrimaryButton";
import ErrorBanner from "../../../components/ErrorBanner";
import OfflineNote from "../../../components/OfflineNote";
import useServerData from "../../../hooks/useServerData";
import useUserDirectory from "../../../hooks/useUserDirectory";
import useIsOnline from "../../../hooks/useIsOnline";
import useMyPermissions, { can } from "../../../hooks/useMyPermissions";
import { getService, setServiceStatus, setSubtaskDone } from "../api/serviceApi";
import { SERVICE_STATUS, isOverdue } from "../services.utils";
import { formatDate } from "../../../utils/date.utils";
import { messageFromError } from "../../../utils/apiError.utils";
import { SCREENS } from "../../../constants/screens.constants";
import { colors, spacing, typography } from "../../../theme";

/**
 * One service (app-plan.md §1.6): what it is, when it is due, who assigned
 * it, and its subtasks — each tickable through the subtask endpoint — and
 * "Mark complete" through the status endpoint. Both already let the
 * assignee act without an edit grant; the app sends the request and shows
 * the server's answer, including its refusal, verbatim. Every change
 * re-reads the record, so what is shown is what the server holds.
 *
 * Offline, ticking and completing are server changes with no queue (§3.3):
 * the controls stay, disabled, with the reason.
 *
 * "Edit" appears only when the server's permissions carry services.edit (a
 * manager, from the Team tab, where the form is registered); an employee
 * never sees it, and the server would refuse the PATCH regardless.
 */
function ServiceDetailScreen({ navigation, route }) {
  const { serviceId } = route.params;
  const isOnline = useIsOnline();
  const service = useServerData(async () => (await getService(serviceId)).data.data, { deps: [serviceId] });
  const { nameById } = useUserDirectory();
  const { permissions } = useMyPermissions();
  const canEdit = can(permissions, "services", "edit");
  const [busyKey, setBusyKey] = useState(null);
  const [actionError, setActionError] = useState(null);

  async function runAction(key, action) {
    setBusyKey(key);
    setActionError(null);

    try {
      await action();
      await service.refetch();
    } catch (error) {
      setActionError(messageFromError(error));
    } finally {
      setBusyKey(null);
    }
  }

  const record = service.data;
  const isCompleted = record?.status === SERVICE_STATUS.COMPLETED;

  return (
    <Screen onRefresh={service.refetch} refreshing={service.isRefreshing} testID="service-detail-screen">
      <ScreenHeader
        title={record?.title || "Service"}
        onBack={() => navigation.goBack()}
        right={
          record && canEdit ? (
            <Pressable
              onPress={() => navigation.navigate(SCREENS.SERVICE_FORM, { service: record })}
              disabled={!isOnline}
              accessibilityRole="button"
              accessibilityLabel="Edit service"
              style={styles.edit}
              testID="service-edit"
            >
              <Ionicons name="create-outline" size={24} color={isOnline ? colors.brandNavy : colors.disabled} />
            </Pressable>
          ) : null
        }
      />

      <ListState isLoading={service.isLoading} error={service.error} onRetry={service.refetch} testID="service-detail" />

      {record ? (
        <>
          <Card>
            <View style={styles.pills}>
              {isCompleted ? <StatusPill label="Completed" tone="success" /> : <StatusPill label="To Do" />}
              {isOverdue(record) ? <StatusPill label="Overdue" tone="danger" testID="service-detail-overdue" /> : null}
            </View>
            <Row label="Due date" value={record.dueDate ? formatDate(record.dueDate) : "No due date"} />
            <Row label="Assigned by" value={nameById.get(record.createdById) || "—"} />
            {isCompleted ? (
              <Row label="Completed" value={`${formatDate(record.completedAt)} by ${nameById.get(record.completedById) || "—"}`} />
            ) : null}
            {record.description ? (
              <>
                <Text style={[typography.label, styles.rowLabel]}>Description</Text>
                <Text style={typography.body} testID="service-detail-description">
                  {record.description}
                </Text>
              </>
            ) : null}
          </Card>

          <Card>
            <Text style={typography.label}>Subtasks</Text>
            {record.subtasks.length === 0 ? (
              <Text style={[typography.subtitle, styles.rowValue]}>No subtasks.</Text>
            ) : (
              record.subtasks.map((subtask) => (
                <Pressable
                  key={subtask._id}
                  onPress={() => runAction(subtask._id, () => setSubtaskDone(serviceId, subtask._id, !subtask.isDone))}
                  disabled={!isOnline || busyKey !== null}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: subtask.isDone, disabled: !isOnline || busyKey !== null }}
                  style={styles.subtask}
                  testID={`subtask-${subtask._id}`}
                >
                  <Ionicons
                    name={subtask.isDone ? "checkbox" : "square-outline"}
                    size={24}
                    color={subtask.isDone ? colors.brandGreen : colors.textSecondary}
                  />
                  <Text style={[typography.body, styles.subtaskTitle, subtask.isDone && styles.subtaskDone]}>{subtask.title}</Text>
                </Pressable>
              ))
            )}
          </Card>

          <ErrorBanner message={actionError} testID="service-action-error" />

          {isCompleted ? null : (
            <PrimaryButton
              title="Mark complete"
              onPress={() => runAction("status", () => setServiceStatus(serviceId, SERVICE_STATUS.COMPLETED))}
              loading={busyKey === "status"}
              disabled={!isOnline || busyKey !== null}
              testID="service-mark-complete"
            />
          )}
          {!isOnline ? <OfflineNote what="changing a service" /> : null}
        </>
      ) : null}
    </Screen>
  );
}

function Row({ label, value }) {
  return (
    <>
      <Text style={[typography.label, styles.rowLabel]}>{label}</Text>
      <Text style={[typography.body, styles.rowValue]}>{value}</Text>
    </>
  );
}

const styles = StyleSheet.create({
  pills: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm },
  rowLabel: { marginTop: spacing.md },
  rowValue: { marginTop: spacing.xs },
  subtask: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm, minHeight: 44 },
  subtaskTitle: { flex: 1 },
  subtaskDone: { color: colors.textSecondary, textDecorationLine: "line-through" },
  edit: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
});

export default ServiceDetailScreen;
