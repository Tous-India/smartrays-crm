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
import { addVisitPhoto } from "../api/visitApi";
import { getFreshFix } from "../visits.utils";
import { CAMERA_PERMISSION, PERMISSION_STATUS, openAppSettings, requestPermission } from "../../../utils/permissions.utils";
import { messageFromError } from "../../../utils/apiError.utils";
import { colors, radius, spacing, typography } from "../../../theme";

/**
 * A site photo for a verified visit (2026-10-22). The in-app camera only —
 * back-facing, no gallery — because the photo is proof of being there. On
 * "Use this photo" the app takes a fresh GPS fix and sends photo + fix +
 * the moment it was taken; the server stamps it and refuses it if the phone
 * is not at the site or the photo is not from just now.
 */
function VisitPhotoScreen({ navigation, route }) {
  const { visitId } = route.params;
  const isFocused = useIsFocused();
  const cameraRef = useRef(null);
  const device = useCameraDevice("back");
  const [cameraPermission, setCameraPermission] = useState(null);
  const [photo, setPhoto] = useState(null); // { uri, takenAt }
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
      const takenAt = new Date().toISOString();
      const file = await cameraRef.current.takePhoto({ flash: "off", enableShutterSound: false });
      const compressed = await compressPhoto(`file://${file.path}`);
      setPhoto({ uri: compressed.uri, takenAt });
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
      const coords = await getFreshFix();
      await addVisitPhoto(visitId, { coords, photoUri: photo.uri, capturedAt: photo.takenAt });
      navigation.goBack();
    } catch (error) {
      setErrorMessage(error.response ? messageFromError(error) : error.message);
    } finally {
      setIsSending(false);
    }
  }

  const blocked = cameraPermission === PERMISSION_STATUS.BLOCKED || cameraPermission === PERMISSION_STATUS.DENIED;

  return (
    <Screen testID="visit-photo-screen">
      <ScreenHeader title="Site photo" subtitle="Taken here, now — with your location" onBack={() => navigation.goBack()} />

      {blocked ? (
        <View style={styles.message}>
          <Text style={typography.body}>The camera is needed to photograph the site.</Text>
          <LinkText title="Open settings" onPress={openAppSettings} />
        </View>
      ) : photo ? (
        <Image source={{ uri: photo.uri }} style={styles.preview} testID="visit-photo-preview" />
      ) : device && cameraPermission === PERMISSION_STATUS.GRANTED ? (
        <Camera ref={cameraRef} style={styles.preview} device={device} isActive={isFocused} photo testID="visit-camera" />
      ) : (
        <View style={[styles.preview, styles.centre]}>
          <ActivityIndicator color={colors.brandNavy} />
        </View>
      )}

      <ErrorBanner message={errorMessage} testID="visit-photo-error" />

      {photo ? (
        <>
          <PrimaryButton title="Use this photo" onPress={send} loading={isSending} disabled={isSending} testID="visit-photo-send" />
          <View style={styles.retake}>
            <LinkText title="Take again" onPress={() => setPhoto(null)} testID="visit-photo-retake" />
          </View>
        </>
      ) : (
        <PrimaryButton title="Take photo" onPress={take} loading={isCapturing} disabled={blocked || !device || isCapturing} testID="visit-photo-take" />
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

export default VisitPhotoScreen;
