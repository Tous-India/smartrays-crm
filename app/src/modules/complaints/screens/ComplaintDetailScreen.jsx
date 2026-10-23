import { useState } from "react";
import { Image, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import Screen from "../../../components/Screen";
import ScreenHeader from "../../../components/ScreenHeader";
import Card from "../../../components/Card";
import StatusPill from "../../../components/StatusPill";
import ListState from "../../../components/ListState";
import PrimaryButton from "../../../components/PrimaryButton";
import TextField from "../../../components/TextField";
import ErrorBanner from "../../../components/ErrorBanner";
import OfflineNote from "../../../components/OfflineNote";
import useServerData from "../../../hooks/useServerData";
import useIsOnline from "../../../hooks/useIsOnline";
import useMyPermissions, { can } from "../../../hooks/useMyPermissions";
import useSessionStore from "../../../store/sessionStore";
import { getComplaint, setComplaintStatus } from "../api/complaintApi";
import { CALLBACK_LABEL, CATEGORY_LABEL, COMPLAINT_STATUS, STATUS_LABEL, STATUS_TONE, timeAgo } from "../complaints.utils";
import { messageFromError } from "../../../utils/apiError.utils";
import { colors, spacing, typography } from "../../../theme";

/**
 * One customer complaint (2026-10-22), for the person handling it in the
 * field: one big Call button, when the customer wants the call, what they
 * said, their photos — then the one next step: "I'm on it", then "Mark
 * resolved". The server decides who may move it (the assignee, or someone
 * holding tickets.assign); the buttons show only for them, and a refusal is
 * shown in the server's words. Offline, the buttons stay, disabled (§3.3).
 */
function ComplaintDetailScreen({ navigation, route }) {
  const { ticketId } = route.params;
  const isOnline = useIsOnline();
  const me = useSessionStore((state) => state.user);
  const { permissions } = useMyPermissions();
  const complaint = useServerData(async () => (await getComplaint(ticketId)).data.data, { deps: [ticketId] });
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(null);
  const [actionError, setActionError] = useState(null);

  const record = complaint.data;
  const canAct = Boolean(record) && (can(permissions, "tickets", "assign") || String(record.assignedTo?._id) === String(me?._id));
  // The person who raised it, if they left a number (2026-10-23); otherwise
  // the customer's primary contact, then the customer's own phone.
  const raisedBy = record?.raisedBy;
  const contact = raisedBy?.phone ? raisedBy : record?.customer.primaryContact;
  const phone = raisedBy?.phone || contact?.phone || record?.customer.phone;

  async function move(status, comment) {
    setBusy(status);
    setActionError(null);
    try {
      await setComplaintStatus(ticketId, status, comment);
      setNote("");
      await complaint.refetch();
    } catch (error) {
      setActionError(messageFromError(error));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen onRefresh={complaint.refetch} refreshing={complaint.isRefreshing} testID="complaint-detail-screen">
      <ScreenHeader title={record?.number ? `Complaint ${record.number}` : "Complaint"} onBack={() => navigation.goBack()} />

      <ListState isLoading={complaint.isLoading} error={complaint.error} onRetry={complaint.refetch} skeleton="service" skeletonCount={2} testID="complaint-detail" />

      {record ? (
        <>
          <Card>
            <View style={styles.header}>
              <Text style={[typography.body, styles.customer]}>{record.customer.companyName}</Text>
              <StatusPill label={STATUS_LABEL[record.status]} tone={STATUS_TONE[record.status]} testID="complaint-status" />
            </View>
            {record.customer.siteAddress ? <Text style={[typography.small, styles.line]}>{record.customer.siteAddress}</Text> : null}
            {raisedBy ? (
              <Text style={[typography.body, styles.line]} testID="complaint-raised-by">
                Raised by {raisedBy.name || "the customer"}
                {raisedBy.phone ? ` · ${raisedBy.phone}` : ""}
              </Text>
            ) : null}

            {phone ? (
              <Pressable
                onPress={() => Linking.openURL(`tel:${phone.replace(/\s+/g, "")}`)}
                accessibilityRole="button"
                accessibilityLabel={`Call ${contact?.name || "customer"}`}
                style={styles.call}
                testID="complaint-call"
              >
                <Ionicons name="call" size={22} color={colors.textOnBrand} />
                <Text style={styles.callText} numberOfLines={1}>
                  Call {contact?.name || "customer"} · {phone}
                </Text>
              </Pressable>
            ) : (
              <Text style={[typography.small, styles.line]}>No phone number saved for this customer.</Text>
            )}
            {record.callbackTime ? (
              <Text style={[typography.body, styles.line]} testID="complaint-callback">
                Wants a call: {CALLBACK_LABEL[record.callbackTime]}
              </Text>
            ) : null}
          </Card>

          <Card>
            <Text style={typography.small}>
              {CATEGORY_LABEL[record.category] || "Complaint"} · raised {timeAgo(record.createdAt)}
            </Text>
            {record.description ? (
              <Text style={[typography.body, styles.line]} testID="complaint-description">
                {record.description}
              </Text>
            ) : null}
            {record.photoUrls.length > 0 ? (
              <View style={styles.photos}>
                {record.photoUrls.map((url, index) => (
                  <Pressable key={url} onPress={() => Linking.openURL(url)} accessibilityLabel={`Open photo ${index + 1}`} testID={`complaint-photo-${index}`}>
                    <Image source={{ uri: url }} style={styles.photo} />
                  </Pressable>
                ))}
              </View>
            ) : null}
          </Card>

          <ErrorBanner message={actionError} testID="complaint-action-error" />

          {canAct && record.status === COMPLAINT_STATUS.OPEN ? (
            <PrimaryButton title="I'm on it" onPress={() => move(COMPLAINT_STATUS.IN_PROGRESS)} loading={busy === COMPLAINT_STATUS.IN_PROGRESS} disabled={!isOnline || busy !== null} testID="complaint-on-it" />
          ) : null}

          {canAct && (record.status === COMPLAINT_STATUS.OPEN || record.status === COMPLAINT_STATUS.IN_PROGRESS) ? (
            <>
              <TextField label="What was done? (optional)" value={note} onChangeText={setNote} maxLength={500} containerStyle={styles.note} testID="complaint-note" />
              <PrimaryButton title="Mark resolved" onPress={() => move(COMPLAINT_STATUS.RESOLVED, note.trim() || undefined)} loading={busy === COMPLAINT_STATUS.RESOLVED} disabled={!isOnline || busy !== null} testID="complaint-resolve" />
            </>
          ) : null}

          {!isOnline && canAct ? <OfflineNote what="updating a complaint" /> : null}

          <Text style={[typography.label, styles.section]}>History</Text>
          {record.history.map((entry, index) => (
            <View key={index} style={styles.history}>
              <Text style={typography.small}>
                {entry.by} · {timeAgo(entry.createdAt)}
              </Text>
              {entry.type === "status_change" ? <Text style={typography.body}>Changed to {STATUS_LABEL[entry.toStatus]}</Text> : null}
              {entry.comment ? <Text style={typography.body}>{entry.comment}</Text> : null}
            </View>
          ))}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm },
  customer: { flex: 1, fontWeight: "600" },
  line: { marginTop: spacing.sm },
  call: {
    marginTop: spacing.md,
    minHeight: 52,
    borderRadius: 10,
    backgroundColor: colors.brandNavy,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  callText: { color: colors.textOnBrand, fontSize: 16, fontWeight: "600", flexShrink: 1 },
  photos: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  photo: { width: 96, height: 96, borderRadius: 8, backgroundColor: colors.brandPanelAlt },
  note: { marginTop: spacing.md },
  section: { marginTop: spacing.lg, marginBottom: spacing.sm },
  history: { paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
});

export default ComplaintDetailScreen;
