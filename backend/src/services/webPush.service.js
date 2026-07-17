import webPush from "web-push";
import { env } from "../config/env.js";

webPush.setVapidDetails(env.vapidSubject, env.vapidPublicKey, env.vapidPrivateKey);

/**
 * Sends one Web Push message to one subscription. `subscription` is the
 * shape the browser's Push API gives the client
 * (`{ endpoint, keys: { p256dh, auth } }`) — `notification.service.js`
 * builds it from a stored `PushSubscription` document. `payload` is
 * whatever JSON the service worker's `push` handler expects to receive
 * (title/body/etc.) — serialized here, not by the caller, so every call
 * site sends the same shape consistently.
 *
 * Deliberately thin: no try/catch here — a failed send (expired
 * subscription, network error, malformed keys) is `notification.service.js`'s
 * concern to handle (log and continue, per-subscription, never blocking the
 * notification record itself), not this wrapper's. Mocked at the module
 * boundary in tests, same pattern as Cloudinary/Google Maps — no test ever
 * makes a real push network call.
 */
export function sendPush(subscription, payload) {
  return webPush.sendNotification(subscription, JSON.stringify(payload));
}
