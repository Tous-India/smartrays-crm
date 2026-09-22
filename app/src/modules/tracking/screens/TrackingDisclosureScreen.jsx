import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Screen from "../../../components/Screen";
import PrimaryButton from "../../../components/PrimaryButton";
import LinkText from "../../../components/LinkText";
import ErrorBanner from "../../../components/ErrorBanner";
import { getLocationConfig } from "../locationApi";
import { recordDisclosureAnswer, requestTrackingPermissions } from "../tracking.service";
import { CAPTURE_MODES, SCREENS } from "../../../constants/screens.constants";
import { DISCLOSURE_ANSWERS } from "../../../constants/tracking.constants";
import { PERMISSION_STATUS } from "../../../utils/permissions.utils";
import { messageFromError } from "../../../utils/apiError.utils";
import { colors, radius, spacing, typography } from "../../../theme";

/**
 * The prominent in-app disclosure Google Play requires before background
 * location is requested (app-plan.md §4.1): its own full screen, the app's
 * own words, an explicit accept. Shown once, the first time the employee
 * taps Check in, BEFORE any OS dialog. "Continue" walks the permission
 * sequence; "Not now" leaves check-in available with tracking off, and the
 * shift card says so.
 *
 * The figures are quotes of the server's rules, not rules of their own: the
 * cadence comes from GET /location/config, the retention window is the
 * decided ping TTL (up to 47 days after capture for a late upload).
 *
 * The answer is recorded on the server (`POST /location/consent`, final-
 * plan.md §7.73) with the version of this text, the app version and the
 * install's device id, and cached on the device; a change to this text bumps
 * DISCLOSURE_VERSION and everyone is asked again.
 */
function TrackingDisclosureScreen({ navigation }) {
  const [intervalMinutes, setIntervalMinutes] = useState(null);
  const [isWorking, setIsWorking] = useState(false);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    getLocationConfig()
      .then((response) => setIntervalMinutes(Number(response.data.data.pingIntervalMinutes)))
      .catch(() => setIntervalMinutes(null));
  }, []);

  function goToCheckIn() {
    navigation.replace(SCREENS.CAPTURE, { mode: CAPTURE_MODES.CHECK_IN });
  }

  async function handleContinue() {
    if (isWorking) {
      return;
    }

    setIsWorking(true);
    setNotice(null);

    try {
      await recordDisclosureAnswer(DISCLOSURE_ANSWERS.GRANTED);
      const granted = await requestTrackingPermissions();

      if (granted.fine !== PERMISSION_STATUS.GRANTED || granted.background !== PERMISSION_STATUS.GRANTED) {
        setNotice(
          "Location was not allowed for all the time, so your shift will not be tracked. You can still check in; " +
            "the shift card shows how to turn tracking on."
        );
        setIsWorking(false);
        return;
      }

      goToCheckIn();
    } catch (error) {
      setNotice(messageFromError(error, "Your answer could not be recorded. Check your connection and try again."));
      setIsWorking(false);
    }
  }

  async function handleNotNow() {
    if (isWorking) {
      return;
    }

    setIsWorking(true);
    setNotice(null);

    try {
      await recordDisclosureAnswer(DISCLOSURE_ANSWERS.DECLINED);
      goToCheckIn();
    } catch (error) {
      setNotice(messageFromError(error, "Your answer could not be recorded. Check your connection and try again."));
      setIsWorking(false);
    }
  }

  const cadence = intervalMinutes ? `about every ${intervalMinutes} minutes` : "a few times an hour";

  return (
    <Screen testID="tracking-disclosure-screen">
      <Text style={typography.title}>Smartrays tracks your location during your shift</Text>
      <Text style={[typography.subtitle, styles.subtitle]}>Please read this before you check in.</Text>

      <View style={styles.card}>
        <Row label="What is collected">Your phone&apos;s location (GPS position and its accuracy).</Row>
        <Row label="When">
          Only while you are checked in — including when the app is closed or your screen is off. Tracking starts
          when you check in and stops when you check out. It never runs when you are not on a shift.
        </Row>
        <Row label="How often">One position {cadence}.</Row>
        <Row label="Who can see it">Your manager and the company&apos;s admins, on the team map.</Row>
        <Row label="How long it is kept">Up to 47 days, then deleted automatically.</Row>
      </View>

      <ErrorBanner message={notice} testID="tracking-disclosure-notice" />

      {notice && !notice.includes("could not be recorded") ? (
        <PrimaryButton title="Check in without tracking" onPress={goToCheckIn} testID="tracking-disclosure-proceed" />
      ) : (
        <PrimaryButton title="Continue" onPress={handleContinue} loading={isWorking} testID="tracking-disclosure-continue" />
      )}

      <View style={styles.footer}>
        <LinkText title="Not now" onPress={handleNotNow} testID="tracking-disclosure-not-now" />
      </View>
    </Screen>
  );
}

function Row({ label, children }) {
  return (
    <View style={styles.row}>
      <Text style={typography.label}>{label}</Text>
      <Text style={[typography.body, styles.rowText]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  subtitle: { marginTop: spacing.xs + 2, marginBottom: spacing.xl },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  row: { marginBottom: spacing.lg },
  rowText: { marginTop: spacing.xs },
  footer: { marginTop: spacing.lg, alignItems: "center" },
});

export default TrackingDisclosureScreen;
