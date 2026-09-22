import { cert, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { env } from "../config/env.js";

/**
 * Firebase Cloud Messaging through the Admin SDK (HTTP v1; the legacy
 * server key is deprecated) — mobile-backend-plan.md §2.3/§2.4.
 *
 * Gated by FCM_ENABLED: a deployment without Firebase configured never
 * initialises the SDK and `isFcmEnabled()` tells the dispatcher to skip the
 * FCM branch, so everything behaves exactly as before Firebase existed.
 * Initialised lazily on the first send, from the three service-account
 * values in the environment — no key file on disk (Vercel has none), and
 * nothing here ever logs the private key.
 *
 * Deliberately thin, like webPush.service.js: no try/catch — the caller
 * (push.service.js) decides what a failure means per device. Mocked at the
 * module boundary in tests; no test makes a real FCM call.
 */
let app = null;

export function isFcmEnabled() {
  return env.fcmEnabled;
}

function getApp() {
  if (!app) {
    // firebase-admin 14 is modular: initializeApp/cert from "firebase-admin/app".
    app = initializeApp({
      credential: cert({
        projectId: env.firebaseProjectId,
        clientEmail: env.firebaseClientEmail,
        privateKey: env.firebasePrivateKey,
      }),
    });
  }

  return app;
}

/**
 * One message to one device. `data` values must be strings (FCM's rule);
 * `channelId` picks the Android notification channel the app created, so a
 * user can mute one category without muting the tracking notification.
 * Resolves to FCM's message id.
 */
export function sendFcm({ token, title, body, data, channelId }) {
  return getMessaging(getApp()).send({
    token,
    notification: { title, body },
    data,
    android: {
      priority: "high",
      notification: { channelId, sound: "default" },
    },
  });
}

/**
 * The FCM error codes that mean "this token will never work again" — the
 * app was uninstalled, or the token rotated and this one is dead. Mirrors
 * the web path's 404/410: deactivate the row, never retry.
 */
const DEAD_TOKEN_CODES = new Set(["messaging/registration-token-not-registered", "messaging/invalid-argument", "messaging/invalid-registration-token"]);

export function isDeadTokenError(error) {
  return DEAD_TOKEN_CODES.has(error?.code || error?.errorInfo?.code);
}
