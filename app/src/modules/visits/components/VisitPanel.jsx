import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Card from "../../../components/Card";
import StatusPill from "../../../components/StatusPill";
import PrimaryButton from "../../../components/PrimaryButton";
import TextField from "../../../components/TextField";
import ErrorBanner from "../../../components/ErrorBanner";
import OfflineNote from "../../../components/OfflineNote";
import { arriveAtVisit, completeVisit } from "../api/visitApi";
import { VISIT_STATUS_LABEL, VISIT_STATUS_TONE, distanceMeters, getFreshFix, plainDistance } from "../visits.utils";
import { messageFromError } from "../../../utils/apiError.utils";
import { colors, spacing, typography } from "../../../theme";

const time = (iso) => new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

/**
 * The site-visit part of a Service screen (2026-10-22). Three steps, one at
 * a time, each proved by the phone's location: "I've arrived" → site photos
 * → "Mark visit done". Each press takes a fresh GPS fix and lets the server
 * decide; when it refuses ("You are 3.2 km from the site…") the employee
 * reads exactly that. The phone also shows how far the site is after a fix.
 * Only the assignee sees the buttons (`canAct`).
 */
function VisitPanel({ visit, canAct, isOnline, onChanged, onTakePhoto }) {
  const [busy, setBusy] = useState(null);
  const [message, setMessage] = useState(null);
  const [lastDistance, setLastDistance] = useState(null);
  const [notes, setNotes] = useState("");

  const arrived = Boolean(visit.arrival?.at);
  const done = Boolean(visit.completion?.at);

  async function withFix(key, action) {
    setBusy(key);
    setMessage(null);
    try {
      const coords = await getFreshFix();
      setLastDistance(distanceMeters(coords, visit.site));
      await action(coords);
      await onChanged();
    } catch (error) {
      setMessage(error.response ? messageFromError(error) : error.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card testID="visit-panel">
      <View style={styles.header}>
        <Text style={typography.label}>Site visit</Text>
        <StatusPill label={VISIT_STATUS_LABEL[visit.status] || visit.status} tone={VISIT_STATUS_TONE[visit.status]} testID="visit-status" />
      </View>
      {visit.siteAddress ? <Text style={[typography.body, styles.line]}>{visit.siteAddress}</Text> : null}
      <Text style={[typography.small, styles.line]}>
        Arrived and Done work only within {visit.radiusMeters} m of the site.
      </Text>
      {lastDistance !== null && !done ? (
        <Text style={[typography.body, styles.line, lastDistance > visit.radiusMeters && styles.far]} testID="visit-distance">
          You are {plainDistance(lastDistance)} from the site.
        </Text>
      ) : null}

      {arrived ? <Text style={[typography.body, styles.line]}>Arrived {time(visit.arrival.at)}</Text> : null}
      {arrived ? (
        <Text style={[typography.body, styles.line]} testID="visit-photo-count">
          {visit.photoCount ?? visit.photos?.length ?? 0} site photo(s)
        </Text>
      ) : null}
      {done ? <Text style={[typography.body, styles.line]}>Done {time(visit.completion.at)}</Text> : null}

      <ErrorBanner message={message} testID="visit-error" />

      {canAct && !arrived ? (
        <PrimaryButton
          title="I've arrived"
          onPress={() => withFix("arrive", (coords) => arriveAtVisit(visit._id, coords))}
          loading={busy === "arrive"}
          disabled={!isOnline || busy !== null}
          style={styles.button}
          testID="visit-arrive"
        />
      ) : null}

      {canAct && arrived && !done ? (
        <>
          <PrimaryButton title="Take a site photo" onPress={onTakePhoto} disabled={!isOnline || busy !== null} style={styles.button} testID="visit-photo" />
          <TextField label="What did you find? (optional)" value={notes} onChangeText={setNotes} maxLength={1000} containerStyle={styles.button} testID="visit-notes" />
          <PrimaryButton
            title="Mark visit done"
            onPress={() => withFix("complete", (coords) => completeVisit(visit._id, { coords, notes: notes.trim() }))}
            loading={busy === "complete"}
            disabled={!isOnline || busy !== null}
            style={styles.button}
            testID="visit-done"
          />
        </>
      ) : null}

      {canAct && !done && !isOnline ? <OfflineNote what="recording the visit" /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm },
  line: { marginTop: spacing.sm },
  far: { color: colors.danger, fontWeight: "600" },
  button: { marginTop: spacing.md },
});

export default VisitPanel;
