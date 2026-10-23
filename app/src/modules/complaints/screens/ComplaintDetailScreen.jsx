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
import LinkText from "../../../components/LinkText";
import ErrorBanner from "../../../components/ErrorBanner";
import OfflineNote from "../../../components/OfflineNote";
import useServerData from "../../../hooks/useServerData";
import useIsOnline from "../../../hooks/useIsOnline";
import useSessionStore from "../../../store/sessionStore";
import { changeComplaintStatus, getComplaint, linkComplaintCustomer, saveComplaintContact, sendComplaintBack } from "../api/complaintApi";
import { CALLBACK_LABEL, PRIORITY, STATUS_LABEL, STATUS_TONE, isResolved, mapsUrl, nextSteps, timeAgo } from "../complaints.utils";
import { SCREENS } from "../../../constants/screens.constants";
import { messageFromError } from "../../../utils/apiError.utils";
import { formatDate } from "../../../utils/date.utils";
import { colors, spacing, typography } from "../../../theme";

/**
 * One customer complaint (2026-10-23), for the person handling it in the
 * field: one big Call button, Google Maps, what the customer said, the
 * matched customer, who assigned it. Assigners get Assign / Reassign; the
 * technician the next steps (On the way → Working → Resolved, with an
 * optional note), a live photo, and Send back with a reason. The server
 * decides who may do what (`canAssign`, `canWork`); a refusal is shown in its
 * words. Offline, the buttons stay, disabled (§3.3).
 */
const HISTORY_TEXT = {
  sent_back: (entry) => `Sent back — ${entry.comment}`,
  status_change: (entry) => `${STATUS_LABEL[entry.toStatus] || entry.toStatus}${entry.comment ? ` — ${entry.comment}` : ""}`,
};

function historyText(entry) {
  if (entry.type === "comment" && entry.by === "Customer") return "Complaint received";
  return HISTORY_TEXT[entry.type]?.(entry) ?? entry.comment ?? entry.type;
}

function ComplaintDetailScreen({ navigation, route }) {
  const { ticketId } = route.params;
  const isOnline = useIsOnline();
  const me = useSessionStore((state) => state.user);
  const complaint = useServerData(async () => (await getComplaint(ticketId)).data.data, { deps: [ticketId] });
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [sendingBack, setSendingBack] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState(null);

  const record = complaint.data;
  const isMine = Boolean(record?.assignedTo) && String(record.assignedTo._id) === String(me?._id);
  const canWork = Boolean(record?.canWork && record.assignedTo) && !isResolved(record);
  const priority = record ? PRIORITY[record.priority] : null;

  async function move(status) {
    setBusy(status);
    setActionError(null);
    try {
      await changeComplaintStatus(ticketId, status, note.trim() || undefined);
      setNote("");
      await complaint.refetch();
    } catch (error) {
      setActionError(messageFromError(error));
    } finally {
      setBusy(null);
    }
  }

  // Unknown caller (2026-10-23): an assigner links the complaint to a customer, then saves the number.
  async function act(key, action) {
    setBusy(key);
    setActionError(null);
    try {
      await action();
      await complaint.refetch();
    } catch (error) {
      setActionError(messageFromError(error));
    } finally {
      setBusy(null);
    }
  }

  async function sendBack() {
    if (reason.trim().length < 5) {
      setReasonError("Please say why you are sending it back.");
      return;
    }
    setBusy("send-back");
    setActionError(null);
    try {
      await sendComplaintBack(ticketId, reason.trim());
      navigation.goBack();
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
              <Text style={[typography.body, styles.customer]}>{record.contactName || "Customer"}</Text>
              <StatusPill label={STATUS_LABEL[record.status]} tone={STATUS_TONE[record.status]} testID="complaint-status" />
            </View>
            <Text style={[typography.small, styles.line, record.matchedCustomer ? styles.matched : null]} testID="complaint-match">
              {record.matchedCustomer
                ? `Existing customer: ${record.matchedCustomer.companyName}${record.matchedCustomer.commissioningDate ? `, installed ${formatDate(record.matchedCustomer.commissioningDate)}` : ""}`
                : "Not matched to an existing customer"}
            </Text>
            {!record.matchedCustomer && record.companyName ? (
              <Text style={[typography.body, styles.line, styles.bold]}>They typed: {record.companyName}</Text>
            ) : null}
            {record.canAssign && !record.matchedCustomer
              ? (record.suggestedCustomers || []).map((suggestion) => (
                  <PrimaryButton
                    key={suggestion._id}
                    title={`Did you mean ${suggestion.companyName}? Link`}
                    onPress={() => act(`link-${suggestion._id}`, () => linkComplaintCustomer(ticketId, suggestion._id))}
                    loading={busy === `link-${suggestion._id}`}
                    disabled={!isOnline || busy !== null}
                    style={styles.button}
                    testID={`complaint-link-${suggestion._id}`}
                  />
                ))
              : null}
            {record.canSaveContact && record.matchedCustomer ? (
              <PrimaryButton
                title={`Save ${record.contactPhone} as a contact for ${record.matchedCustomer.companyName}`}
                onPress={() => act("save-contact", () => saveComplaintContact(ticketId))}
                loading={busy === "save-contact"}
                disabled={!isOnline || busy !== null}
                style={styles.button}
                testID="complaint-save-contact"
              />
            ) : null}
            {record.address ? <Text style={[typography.body, styles.line]}>{record.address}</Text> : null}
            {record.callbackTime ? (
              <Text style={[typography.small, styles.line]} testID="complaint-callback">
                Wants a call: {CALLBACK_LABEL[record.callbackTime]}
              </Text>
            ) : null}

            {record.contactPhone ? (
              <Pressable
                onPress={() => Linking.openURL(`tel:${record.contactPhone.replace(/[^\d+]/g, "")}`)}
                accessibilityRole="button"
                accessibilityLabel={`Call ${record.contactName || "customer"}`}
                style={styles.call}
                testID="complaint-call"
              >
                <Ionicons name="call" size={22} color={colors.textOnBrand} />
                <Text style={styles.callText} numberOfLines={1}>
                  Call {record.contactPhone}
                </Text>
              </Pressable>
            ) : null}
            <Pressable onPress={() => Linking.openURL(mapsUrl(record))} accessibilityRole="button" style={styles.maps} testID="complaint-maps">
              <Ionicons name="navigate" size={20} color={colors.brandNavy} />
              <Text style={styles.mapsText}>Open in Google Maps</Text>
            </Pressable>
          </Card>

          <Card>
            <Text style={typography.small}>Sent {timeAgo(record.createdAt)}</Text>
            <Text style={[typography.body, styles.line]} testID="complaint-description">
              {record.description}
            </Text>
            {record.customerPhotos.length > 0 ? (
              <View style={styles.photos}>
                {record.customerPhotos.map((photo, index) => (
                  <Pressable key={photo.url} onPress={() => Linking.openURL(photo.url)} accessibilityLabel={`Open customer photo ${index + 1}`} testID={`complaint-photo-${index}`}>
                    <Image source={{ uri: photo.url }} style={styles.photo} />
                  </Pressable>
                ))}
              </View>
            ) : null}
          </Card>

          <Card>
            <View style={styles.header}>
              <Text style={typography.label}>Assignment</Text>
              {priority ? <StatusPill label={priority.label} tone={priority.tone} /> : null}
            </View>
            {record.assignedTo ? (
              <>
                <Text style={[typography.body, styles.line, styles.bold]}>
                  {record.assignedTo.name}
                  {record.visitDate ? ` · visit ${formatDate(record.visitDate)}` : ""}
                </Text>
                {record.assignedBy ? <Text style={[typography.small, styles.line]}>Assigned by {record.assignedBy.name}</Text> : null}
              </>
            ) : (
              <Text style={[typography.body, styles.line, styles.danger]}>Not assigned yet</Text>
            )}
            {record.canAssign ? (
              <PrimaryButton
                title={record.assignedTo ? "Reassign" : "Assign"}
                onPress={() => navigation.navigate(SCREENS.ASSIGN_COMPLAINT, { ticketId })}
                disabled={!isOnline}
                style={styles.button}
                testID="complaint-assign"
              />
            ) : null}
          </Card>

          <ErrorBanner message={actionError} testID="complaint-action-error" />

          {canWork ? (
            <Card>
              <Text style={typography.label}>Update</Text>
              <TextField label="Note (optional)" value={note} onChangeText={setNote} maxLength={1000} containerStyle={styles.button} testID="complaint-note" />
              {nextSteps(record).map((step) => (
                <PrimaryButton
                  key={step.value}
                  title={step.label}
                  onPress={() => move(step.value)}
                  loading={busy === step.value}
                  disabled={!isOnline || busy !== null}
                  style={styles.button}
                  testID={`complaint-step-${step.value}`}
                />
              ))}
              <Pressable
                onPress={() => navigation.navigate(SCREENS.COMPLAINT_PHOTO, { ticketId })}
                disabled={!isOnline}
                accessibilityRole="button"
                style={[styles.secondary, !isOnline && styles.disabled]}
                testID="complaint-photo"
              >
                <Ionicons name="camera-outline" size={20} color={colors.brandNavy} />
                <Text style={styles.mapsText}>Add photo</Text>
              </Pressable>

              {isMine && !sendingBack ? (
                <View style={styles.sendBackLink}>
                  <LinkText
                    title={`Send back${record.assignedBy ? ` to ${record.assignedBy.name.split(" ")[0]}` : ""}`}
                    onPress={() => setSendingBack(true)}
                    testID="complaint-send-back"
                  />
                </View>
              ) : null}
              {isMine && sendingBack ? (
                <>
                  <TextField
                    label="Why are you sending it back?"
                    value={reason}
                    onChangeText={(value) => {
                      setReason(value);
                      setReasonError(null);
                    }}
                    maxLength={500}
                    error={reasonError}
                    containerStyle={styles.button}
                    testID="complaint-send-back-reason"
                  />
                  <PrimaryButton
                    title="Send back"
                    onPress={sendBack}
                    loading={busy === "send-back"}
                    disabled={!isOnline || busy !== null}
                    style={styles.button}
                    testID="complaint-send-back-confirm"
                  />
                </>
              ) : null}
              {!isOnline ? <OfflineNote what="updating a complaint" /> : null}
            </Card>
          ) : null}

          {record.staffPhotos.length > 0 ? (
            <Card>
              <Text style={typography.label}>Photos from the site</Text>
              <View style={styles.photos}>
                {record.staffPhotos.map((photo, index) => (
                  <Pressable key={photo.url} onPress={() => Linking.openURL(photo.url)} accessibilityLabel={`Open site photo ${index + 1}`}>
                    <Image source={{ uri: photo.url }} style={styles.photo} />
                  </Pressable>
                ))}
              </View>
            </Card>
          ) : null}

          <Text style={[typography.label, styles.section]}>History</Text>
          {/* A key per entry, not the index: with index keys, a refetch that
              added entries drew one row's text over another on Android. */}
          {record.history.map((entry, index) => (
            <View key={`${entry.createdAt}-${entry.type}-${index}`} style={styles.history}>
              <Text style={typography.body}>{historyText(entry)}</Text>
              <Text style={typography.small}>
                {entry.by} · {timeAgo(entry.createdAt)}
              </Text>
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
  bold: { fontWeight: "600" },
  matched: { color: colors.brandGreen, fontWeight: "600" },
  danger: { color: colors.danger, fontWeight: "600" },
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
  maps: { marginTop: spacing.sm, minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm },
  mapsText: { color: colors.brandNavy, fontSize: 16, fontWeight: "600" },
  secondary: {
    marginTop: spacing.md,
    minHeight: 52,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.brandNavy,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  disabled: { opacity: 0.5 },
  sendBackLink: { marginTop: spacing.lg, alignSelf: "center" },
  photos: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md },
  photo: { width: 96, height: 96, borderRadius: 8, backgroundColor: colors.brandPanelAlt },
  button: { marginTop: spacing.md },
  section: { marginTop: spacing.lg, marginBottom: spacing.sm },
  history: { paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
});

export default ComplaintDetailScreen;
