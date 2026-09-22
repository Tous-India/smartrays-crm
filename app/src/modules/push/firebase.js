import { getApps } from "@react-native-firebase/app";
import { getMessaging } from "@react-native-firebase/messaging";

/**
 * The one place the Firebase SDK is touched. Firebase exists on a device
 * only when the build carried android/app/google-services.json; without it
 * there is no default app and every call below would throw, so callers ask
 * `isFirebaseAvailable()` first and push simply stays off (the rest of the
 * app never notices).
 */
export function isFirebaseAvailable() {
  try {
    return getApps().length > 0;
  } catch (error) {
    return false;
  }
}

export function messaging() {
  return getMessaging();
}
