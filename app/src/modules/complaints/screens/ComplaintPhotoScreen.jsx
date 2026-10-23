import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, StyleSheet, Text, View } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { Camera, useCameraDevice } from "react-native-vision-camera";
import Screen from "../../../components/Screen";
import ScreenHeader from "../../../components/ScreenHeader";
import PrimaryButton from "../../../components/PrimaryButton";
import ErrorBanner from "../../../components/ErrorBanner";
import LinkText from "../../../components/LinkText";
import { compressPhoto } from "../../attendance/photo.utils";
import { addComplaintPhoto } from "../api/complaintApi";
import { CAMERA_PERMISSION, PERMISSION_STATUS, openAppSettings, requestPermission } from "../../../utils/permissions.utils";
import { messageFromError } from "../../../utils/apiError.utils";
import { colors, radius, spacing, typography } from "../../../theme";

/**
 * A photo for a complaint (2026-10-23) — the in-app camera only, back-facing,
 * no gallery: what the technician sees at the site, now. Same camera flow as
 * the site-visit photo (VisitPhotoScreen), without the location check — a
 * complaint has no geofence.
 */
function ComplaintPhotoScreen({ navigation, route }) {
  const { ticketId } = route.params;
  const isFocused = useIsFocused();
  const cameraRef = useRef(null);
  const device = useCameraDevice("back");
  const [cameraPermission, setCameraPermission] = useState(null);
  const [photo, setPhoto] = useState(null); // { uri }
  const [isCapturing, setIsCapturing] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  const askForCamera = useCallback(async () => {
    setCameraPermission(await requestPermission(CAMERA_PERMISSION));
  }, []);

  useEffect(() => {
    askForCamera();
  }, [askForCamera]);

  async function take() {
    setIsCapturing(true);
    setErrorMessage(null);
    try {
      const file = await cameraRef.current.takePhoto({ flash: "off", enableShutterSound: false });
      const compressed = await compressPhoto(`file://${file.path}`);
      setPhoto({ uri: compressed.uri });
    } catch {
      setErrorMessage("Could not take the photo. Please try again.");
    } finally {
      setIsCapturing(false);
    }
  }

  async function send() {
    setIsSending(true);
    setErrorMessage(null);
    try {
      await addComplaintPhoto(ticketId, photo.uri);
      navigation.goBack();
    } catch (error) {
      setErrorMessage(error.response ? messageFromError(error) : "Could not send the photo. Please check your internet.");
    } finally {
      setIsSending(false);
    }
  }

  const blocked = cameraPermission === PERMISSION_STATUS.BLOCKED || cameraPermission === PERMISSION_STATUS.DENIED;

  return (
    <Screen testID="complaint-photo-screen">
      <ScreenHeader title="Complaint photo" subtitle="What you see at the site" onBack={() => navigation.goBack()} />

      {blocked ? (
        <View style={styles.message}>
          <Text style={typography.body}>The camera is needed to take a photo.</Text>
          <LinkText title="Open settings" onPress={openAppSettings} />
        </View>
      ) : photo ? (
        <Image source={{ uri: photo.uri }} style={styles.preview} testID="complaint-photo-preview" />
      ) : device && cameraPermission === PERMISSION_STATUS.GRANTED ? (
        <Camera ref={cameraRef} style={styles.preview} device={device} isActive={isFocused} photo testID="complaint-camera" />
      ) : (
        <View style={[styles.preview, styles.centre]}>
          <ActivityIndicator color={colors.brandNavy} />
        </View>
      )}

      <ErrorBanner message={errorMessage} testID="complaint-photo-error" />

      {photo ? (
        <>
          <PrimaryButton title="Use this photo" onPress={send} loading={isSending} disabled={isSending} testID="complaint-photo-send" />
          <View style={styles.retake}>
            <LinkText title="Take again" onPress={() => setPhoto(null)} testID="complaint-photo-retake" />
          </View>
        </>
      ) : (
        <PrimaryButton title="Take photo" onPress={take} loading={isCapturing} disabled={blocked || !device || isCapturing} testID="complaint-photo-take" />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  preview: { width: "100%", aspectRatio: 3 / 4, borderRadius: radius.md, backgroundColor: colors.brandPanelAlt, marginBottom: spacing.md, overflow: "hidden" },
  centre: { alignItems: "center", justifyContent: "center" },
  message: { paddingVertical: spacing.xl, gap: spacing.md },
  retake: { marginTop: spacing.md, alignSelf: "center" },
});

export default ComplaintPhotoScreen;
