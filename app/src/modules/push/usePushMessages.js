import { useEffect } from "react";
import { getInitialNotification, onMessage, onNotificationOpenedApp } from "@react-native-firebase/messaging";
import { isFirebaseAvailable, messaging } from "./firebase";
import { navigateForNotification } from "./pushNavigation";
import usePushStore from "./pushStore";

/**
 * The three ways a push reaches the app (STEP 4), wired once while signed in:
 *
 *   foreground  — `onMessage`: the system shows nothing; the app shows its
 *                 own banner (pushStore) and a tap on it navigates
 *   background  — Android showed the notification; `onNotificationOpenedApp`
 *                 fires on the tap and the app navigates
 *   quit        — Android showed it; the tap launched the app, and
 *                 `getInitialNotification` hands it over once the navigator
 *                 is ready
 *
 * `navigationRef` is the NavigationContainer's ref; nothing here renders.
 */
function usePushMessages(navigationRef, isSignedIn) {
  useEffect(() => {
    if (!isSignedIn || !isFirebaseAvailable()) {
      return undefined;
    }

    const { showNotice } = usePushStore.getState();
    const instance = messaging();

    const stopForeground = onMessage(instance, (message) => {
      showNotice({
        title: message.notification?.title || "Smartrays",
        body: message.notification?.body || "",
        data: message.data || {},
      });
    });

    const stopOpened = onNotificationOpenedApp(instance, (message) => {
      navigateForNotification(navigationRef, message.data || {});
    });

    let cancelled = false;

    getInitialNotification(instance)
      .then((message) => {
        if (message && !cancelled) {
          // The container may not be ready on the very first tick.
          const attempt = () => {
            if (!navigateForNotification(navigationRef, message.data || {})) {
              setTimeout(attempt, 250);
            }
          };
          attempt();
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      stopForeground();
      stopOpened();
    };
  }, [navigationRef, isSignedIn]);
}

export default usePushMessages;
