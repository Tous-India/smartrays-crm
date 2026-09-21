import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { Camera, useCameraDevice } from "react-native-vision-camera";
import Screen from "../../../components/Screen";
import PrimaryButton from "../../../components/PrimaryButton";
import ErrorBanner from "../../../components/ErrorBanner";
import LinkText from "../../../components/LinkText";
import useIsOnline from "../../../hooks/useIsOnline";
import useLocationFix, { FIX_STATUS } from "../hooks/useLocationFix";
import { checkIn, checkOut } from "../api/attendanceApi";
import { compressPhoto, formatBytes } from "../photo.utils";
import { formatAccuracy } from "../attendance.utils";
import { CAPTURE_MODES } from "../../../constants/screens.constants";
import { LOCATION_FIX_TIMEOUT_MS } from "../../../constants/attendance.constants";
import {
  CAMERA_PERMISSION,
  PERMISSION_STATUS,
  openAppSettings,
  requestPermission,
} from "../../../utils/permissions.utils";
import { messageFromError } from "../../../utils/apiError.utils";
import { colors, radius, spacing, typography } from "../../../theme";

/**
 * Check-in / check-out capture (app-plan.md §1.2): a live photo from the
 * in-app camera (front-facing, capture only — no gallery) and one fresh GPS
 * fix with its accuracy, sent together to the web's own endpoint. The
 * confirm button is enabled only when BOTH are present and the device is
 * online — the same both-or-nothing rule the web enforces, plus the "never
 * offline" rule for a state change (§3.3). Every permission outcome and
 * every way a fix can fail ends on this screen with words and a way out;
 * nothing hangs.
 */
const COPY = {
  [CAPTURE_MODES.CHECK_IN]: { title: "Check in", confirm: "Check in", done: "Checked in" },
  [CAPTURE_MODES.CHECK_OUT]: { title: "Check out", confirm: "Check out", done: "Checked out" },
};

const TIMEOUT_SECONDS = Math.round(LOCATION_FIX_TIMEOUT_MS / 1000);

function CaptureScreen({ navigation, route }) {
  const mode = route.params?.mode || CAPTURE_MODES.CHECK_IN;
  const copy = COPY[mode];
  const isFocused = useIsFocused();
  const isOnline = useIsOnline();
  const cameraRef = useRef(null);
  const frontDevice = useCameraDevice("front");
  const backDevice = useCameraDevice("back");
  const device = frontDevice || backDevice;

  const [cameraPermission, setCameraPermission] = useState(null);
  const location = useLocationFix({ auto: false });
  const requestLocation = location.request;
  const [photo, setPhoto] = useState(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  const askForCamera = useCallback(async () => {
    setCameraPermission(await requestPermission(CAMERA_PERMISSION));
  }, []);

  // One permission dialog at a time. Two concurrent requests make Android
  // drop the second one unanswered, which React Native then reports as
  // "never ask again" for a permission the user was never shown. Camera
  // first, then the location fix — whatever the camera's answer was.
  useEffect(() => {
    let cancelled = false;

    askForCamera().finally(() => {
      if (!cancelled) {
        requestLocation();
      }
    });

    return () => {
      cancelled = true;
    };
  }, [askForCamera, requestLocation]);

  async function handleTakePhoto() {
    if (!cameraRef.current || isCapturing) {
      return;
    }

    setIsCapturing(true);
    setErrorMessage(null);

    try {
      const file = await cameraRef.current.takePhoto({ flash: "off", enableShutterSound: false });
      const compressed = await compressPhoto(`file://${file.path}`);
      setPhoto(compressed);
    } catch (captureError) {
      setErrorMessage("Could not take the photo. Please try again.");
    } finally {
      setIsCapturing(false);
    }
  }

  const hasLocation = location.status === FIX_STATUS.FOUND && Boolean(location.coords);
  const canConfirm = Boolean(photo) && hasLocation && isOnline && !isSubmitting;

  async function handleConfirm() {
    if (!canConfirm) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const payload = { coords: location.coords, photoUri: photo.uri };

      if (mode === CAPTURE_MODES.CHECK_OUT) {
        await checkOut(payload);
      } else {
        await checkIn(payload);
      }

      navigation.goBack();
    } catch (submitError) {
      setErrorMessage(messageFromError(submitError, `Could not ${copy.title.toLowerCase()} — please try again.`));
      setIsSubmitting(false);
    }
  }

  function blockingReason() {
    if (!isOnline) {
      return "No connection — this needs the server.";
    }

    if (!photo && !hasLocation) {
      return "Take a photo and wait for your location.";
    }

    if (!photo) {
      return "Take a photo to continue.";
    }

    if (!hasLocation) {
      return "Waiting for your location.";
    }

    return null;
  }

  return (
    <Screen testID={`capture-screen-${mode}`}>
      <Text style={typography.title}>{copy.title}</Text>
      <Text style={[typography.subtitle, styles.subtitle]}>A live photo and your location — both are required.</Text>

      <ErrorBanner message={errorMessage} testID="capture-error" />

      {/* --- Photo --- */}
      <Text style={typography.label}>Photo</Text>
      <View style={styles.photoBox}>
        {photo ? (
          <Image source={{ uri: photo.uri }} style={styles.preview} resizeMode="cover" testID="capture-photo-preview" />
        ) : (
          <CameraArea
            cameraRef={cameraRef}
            device={device}
            isActive={isFocused && cameraPermission === PERMISSION_STATUS.GRANTED}
            permission={cameraPermission}
            onAskAgain={askForCamera}
          />
        )}
      </View>
      {photo ? (
        <View style={styles.photoRow}>
          <Text style={typography.small} testID="capture-photo-size">
            Photo ready · {formatBytes(photo.sizeBytes)}
          </Text>
          <LinkText title="Retake" onPress={() => setPhoto(null)} testID="capture-retake" />
        </View>
      ) : (
        cameraPermission === PERMISSION_STATUS.GRANTED &&
        device && (
          <PrimaryButton
            title="Take photo"
            onPress={handleTakePhoto}
            loading={isCapturing}
            testID="capture-take-photo"
            style={styles.photoButton}
          />
        )
      )}

      {/* --- Location --- */}
      <Text style={[typography.label, styles.sectionLabel]}>Location</Text>
      <LocationStatus location={location} />

      {/* --- Confirm --- */}
      <PrimaryButton
        title={copy.confirm}
        onPress={handleConfirm}
        disabled={!canConfirm}
        loading={isSubmitting}
        testID="capture-confirm"
        style={styles.confirm}
      />
      {blockingReason() && (
        <Text style={styles.reason} testID="capture-blocking-reason">
          {blockingReason()}
        </Text>
      )}
      <View style={styles.footer}>
        <LinkText title="Cancel" onPress={() => navigation.goBack()} testID="capture-cancel" />
      </View>
    </Screen>
  );
}

/** The camera preview, or the words for why there is none. */
function CameraArea({ cameraRef, device, isActive, permission, onAskAgain }) {
  if (permission === null) {
    return (
      <View style={styles.placeholder}>
        <ActivityIndicator color={colors.brandNavy} />
      </View>
    );
  }

  if (permission === PERMISSION_STATUS.BLOCKED) {
    return (
      <View style={styles.placeholder} testID="capture-camera-blocked">
        <Text style={[typography.body, styles.placeholderText]}>
          Camera access is turned off for Smartrays. The photo is required, so please allow the camera in the
          app&apos;s settings and come back.
        </Text>
        <PrimaryButton title="Open settings" onPress={openAppSettings} testID="capture-camera-settings" />
      </View>
    );
  }

  if (permission === PERMISSION_STATUS.DENIED) {
    return (
      <View style={styles.placeholder} testID="capture-camera-denied">
        <Text style={[typography.body, styles.placeholderText]}>
          The photo proves you were there, so the camera is required to {"check in or out"}.
        </Text>
        <PrimaryButton title="Allow camera" onPress={onAskAgain} testID="capture-camera-ask" />
      </View>
    );
  }

  if (!device) {
    return (
      <View style={styles.placeholder} testID="capture-camera-none">
        <Text style={[typography.body, styles.placeholderText]}>No camera was found on this device.</Text>
      </View>
    );
  }

  return (
    <Camera ref={cameraRef} style={styles.preview} device={device} isActive={isActive} photo testID="capture-camera" />
  );
}

/** One line per fix state, with the action that state needs. */
function LocationStatus({ location }) {
  const { status, coords } = location;

  if (status === FIX_STATUS.LOCATING || status === FIX_STATUS.IDLE) {
    return (
      <View style={styles.locationRow} testID="capture-location-locating">
        <ActivityIndicator size="small" color={colors.brandNavy} />
        <Text style={[typography.body, styles.locationText]}>Getting your location (up to {TIMEOUT_SECONDS} seconds)…</Text>
      </View>
    );
  }

  if (status === FIX_STATUS.FOUND) {
    return (
      <Text style={[typography.body, styles.locationOk]} testID="capture-location-found">
        Location found {formatAccuracy(coords?.accuracy)}
      </Text>
    );
  }

  if (status === FIX_STATUS.POOR) {
    return (
      <View testID="capture-location-poor">
        <Text style={[typography.body, styles.locationWarn]}>
          Location accuracy is low ({formatAccuracy(coords?.accuracy)}). Move to an open area and try again, or use
          this fix as it is.
        </Text>
        <View style={styles.actions}>
          <SecondaryAction title="Try again" onPress={location.request} testID="capture-location-retry" />
          <SecondaryAction title="Use anyway" onPress={location.acceptPoorFix} testID="capture-location-accept" />
        </View>
      </View>
    );
  }

  if (status === FIX_STATUS.TIMEOUT) {
    return (
      <View testID="capture-location-timeout">
        <Text style={[typography.body, styles.locationWarn]}>
          Couldn&apos;t get a GPS fix in {TIMEOUT_SECONDS} seconds. Move to an open area or near a window and try again.
        </Text>
        <View style={styles.actions}>
          <SecondaryAction title="Try again" onPress={location.request} testID="capture-location-retry" />
        </View>
      </View>
    );
  }

  if (status === FIX_STATUS.UNAVAILABLE) {
    return (
      <View testID="capture-location-unavailable">
        <Text style={[typography.body, styles.locationWarn]}>
          Location is unavailable. Turn on location services on this phone and try again.
        </Text>
        <View style={styles.actions}>
          <SecondaryAction title="Try again" onPress={location.request} testID="capture-location-retry" />
        </View>
      </View>
    );
  }

  if (status === FIX_STATUS.DENIED) {
    return (
      <View testID="capture-location-denied">
        <Text style={[typography.body, styles.locationWarn]}>
          Your location is required to record where you checked in. Please allow it.
        </Text>
        <View style={styles.actions}>
          <SecondaryAction title="Allow location" onPress={location.request} testID="capture-location-ask" />
        </View>
      </View>
    );
  }

  return (
    <View testID="capture-location-blocked">
      <Text style={[typography.body, styles.locationWarn]}>
        Location access is turned off for Smartrays. It is required, so please allow it in the app&apos;s settings
        and come back.
      </Text>
      <View style={styles.actions}>
        <SecondaryAction title="Open settings" onPress={openAppSettings} testID="capture-location-settings" />
        <SecondaryAction title="Try again" onPress={location.request} testID="capture-location-retry" />
      </View>
    </View>
  );
}

function SecondaryAction({ title, onPress, testID }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" testID={testID} style={styles.secondary}>
      <Text style={styles.secondaryText}>{title}</Text>
    </Pressable>
  );
}

const PREVIEW_HEIGHT = 320;

const styles = StyleSheet.create({
  subtitle: { marginTop: spacing.xs + 2, marginBottom: spacing.xl },
  photoBox: {
    marginTop: spacing.sm,
    height: PREVIEW_HEIGHT,
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: colors.brandPanelAlt,
  },
  preview: { width: "100%", height: PREVIEW_HEIGHT },
  placeholder: { flex: 1, alignItems: "stretch", justifyContent: "center", padding: spacing.lg },
  placeholderText: { textAlign: "center", marginBottom: spacing.lg },
  photoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.sm },
  photoButton: { marginTop: spacing.md },
  sectionLabel: { marginTop: spacing.xl },
  locationRow: { flexDirection: "row", alignItems: "center", marginTop: spacing.sm },
  locationText: { marginLeft: spacing.sm },
  locationOk: { marginTop: spacing.sm, color: colors.brandGreen },
  locationWarn: { marginTop: spacing.sm },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginTop: spacing.sm },
  secondary: {
    borderWidth: 1,
    borderColor: colors.brandNavy,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  secondaryText: { ...typography.body, color: colors.brandNavy, fontWeight: "600" },
  confirm: { marginTop: spacing.xxl },
  reason: { ...typography.small, color: colors.danger, marginTop: spacing.sm, textAlign: "center" },
  footer: { marginTop: spacing.lg, alignItems: "center" },
});

export default CaptureScreen;
