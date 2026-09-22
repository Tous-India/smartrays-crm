import { PermissionsAndroid, Platform } from "react-native";
import { deleteToken, getToken, onTokenRefresh } from "@react-native-firebase/messaging";
import { isFirebaseAvailable, messaging } from "./firebase";
import { registerPushDevice, unregisterPushDevice } from "./pushApi";
import { getDeviceId } from "../../store/tokenStorage";
import packageJson from "../../../package.json";

/**
 * This install's push registration (STEP 4, mobile-backend-plan.md §2).
 *
 * After every sign-in and launch restore the FCM token is sent to
 * `POST /notifications/devices` with the same device id the refresh token
 * carries, so a logout can silence the device from either end; a token the
 * SDK rotates is re-sent the same way. Sign-out unregisters the token first
 * and then deletes it locally, so a phone handed to someone else starts
 * clean. Nothing here throws to a caller — push is a convenience, never a
 * reason a sign-in fails — and with no Firebase config in the build it all
 * quietly does nothing.
 *
 * Notification permission (Android 13+) is the one the tracking disclosure
 * already asks for; `ensureNotificationPermission` asks only when it was
 * never answered, which Android handles as a single dialog per install.
 */
let currentToken = null;
let stopTokenRefresh = null;

export async function ensureNotificationPermission() {
  if (Platform.OS !== "android" || Platform.Version < 33) {
    return true;
  }

  const permission = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;

  if (await PermissionsAndroid.check(permission)) {
    return true;
  }

  // Already refused once means Android shows nothing and answers "denied"
  // straight away; already granted answers without a dialog. Either way
  // this is never a second prompt.
  const result = await PermissionsAndroid.request(permission);

  return result === PermissionsAndroid.RESULTS.GRANTED;
}

export async function registerForPush() {
  if (!isFirebaseAvailable()) {
    return null;
  }

  try {
    await ensureNotificationPermission();

    const token = await getToken(messaging());
    await sendToken(token);

    if (!stopTokenRefresh) {
      stopTokenRefresh = onTokenRefresh(messaging(), (refreshed) => {
        sendToken(refreshed).catch(() => {});
      });
    }

    return token;
  } catch (error) {
    console.log(`[push] registration skipped: ${error.message}`);
    return null;
  }
}

async function sendToken(token) {
  currentToken = token;
  await registerPushDevice({ token, deviceId: await getDeviceId(), appVersion: packageJson.version });
}

/**
 * Sign-out: tell the server first (best effort — the session may already be
 * dead), then drop the token so a new sign-in gets a fresh one.
 */
export async function unregisterForPush() {
  if (!isFirebaseAvailable()) {
    return;
  }

  if (stopTokenRefresh) {
    stopTokenRefresh();
    stopTokenRefresh = null;
  }

  const token = currentToken;
  currentToken = null;

  if (token) {
    try {
      await unregisterPushDevice(token);
    } catch (error) {
      // The server-side logout deactivates the device by id regardless.
    }
  }

  try {
    await deleteToken(messaging());
  } catch (error) {
    // Nothing to do: the next sign-in registers whatever token exists then.
  }
}

/** Tests: the token the last registration sent, if any. */
export function getCurrentPushToken() {
  return currentToken;
}
