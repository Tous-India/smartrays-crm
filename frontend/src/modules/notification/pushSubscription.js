import { subscribeToPush, unsubscribeFromPush } from "./api/notificationApi";

/**
 * Browser Web Push, client half (§6.7, 2026-08-07). The backend half —
 * `web-push`, `sendPush`, the VAPID pair, `/notifications/subscribe`,
 * `PushSubscription` with 404/410 deactivation — already existed; this is
 * what was deliberately scoped out.
 *
 * No reminder-specific code anywhere: `createNotification` already pushes to
 * every active subscription, so EVERY existing notification type starts
 * reaching closed browsers the moment a user enables this.
 */

const SW_PATH = "/sw.js";

/**
 * The last subscription endpoint we told the server about. Browsers rotate a
 * subscription on their own schedule (Chrome does it when a push service
 * endpoint expires), and a rotated subscription the server never hears about
 * is a silently dead one — pushes go to the old endpoint and 410, which
 * deactivates it, and the user simply stops receiving anything.
 */
const LAST_SENT_KEY = "smartrays:push-endpoint";

/** The VAPID PUBLIC key. The private key never leaves the server. */
export function getVapidPublicKey() {
  return import.meta.env.VITE_VAPID_PUBLIC_KEY || null;
}

export function isPushSupported() {
  return (
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    typeof window !== "undefined" &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/**
 * `default` (never asked) | `granted` | `denied` | `unsupported`.
 *
 * `denied` is terminal: a browser will not re-prompt programmatically once a
 * user has refused, so the UI has to say "change it in your browser settings"
 * rather than offering a button that silently does nothing.
 */
export function getPermissionState() {
  if (!isPushSupported()) {
    return "unsupported";
  }

  return Notification.permission;
}

/** base64url → Uint8Array, the shape `applicationServerKey` requires. */
export function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);

  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

/**
 * Registers the worker. Called on app load — registration alone prompts for
 * nothing, so it is safe. The permission prompt is deliberately deferred to
 * an explicit toggle: browsers penalise sites that ask on load, and users
 * reflexively deny a prompt they did not invite.
 */
export async function registerServiceWorker() {
  if (!isPushSupported()) {
    return null;
  }

  try {
    return await navigator.serviceWorker.register(SW_PATH);
  } catch {
    // A failed registration must never break app startup.
    return null;
  }
}

export async function getExistingSubscription() {
  if (!isPushSupported()) {
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.ready;

    return await registration.pushManager.getSubscription();
  } catch {
    return null;
  }
}

/**
 * Re-sends a subscription the browser has rotated behind our back (§6.7
 * item 6). Compares the current endpoint with the last one we sent; if they
 * differ, the server is holding a dead endpoint and needs the new one.
 *
 * Runs on load and is silent — the user did nothing and should see nothing.
 */
export async function syncSubscription() {
  const subscription = await getExistingSubscription();

  if (!subscription) {
    return { synced: false, reason: "no-subscription" };
  }

  const lastSent = window.localStorage.getItem(LAST_SENT_KEY);

  if (lastSent === subscription.endpoint) {
    return { synced: false, reason: "unchanged" };
  }

  try {
    await subscribeToPush(subscription.toJSON());
    window.localStorage.setItem(LAST_SENT_KEY, subscription.endpoint);

    return { synced: true, reason: lastSent ? "rotated" : "first-sync" };
  } catch {
    return { synced: false, reason: "request-failed" };
  }
}

/**
 * Prompts for permission and subscribes. Only ever called from a deliberate
 * user action.
 *
 * Returns `{ ok, permission, reason }` rather than throwing, because every
 * failure here is a state the toggle has to render honestly — a denied
 * permission is not an error, it is an answer.
 */
export async function enablePush() {
  if (!isPushSupported()) {
    return { ok: false, permission: "unsupported", reason: "unsupported" };
  }

  const vapidKey = getVapidPublicKey();

  if (!vapidKey) {
    // Configuration gap, not a user problem. Same shape as the backend's
    // "503 when no cleanup secret is configured" rather than failing oddly.
    return { ok: false, permission: getPermissionState(), reason: "not-configured" };
  }

  const permission = await Notification.requestPermission();

  if (permission !== "granted") {
    return { ok: false, permission, reason: permission === "denied" ? "denied" : "dismissed" };
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    });

    await subscribeToPush(subscription.toJSON());
    window.localStorage.setItem(LAST_SENT_KEY, subscription.endpoint);

    return { ok: true, permission: "granted", reason: "subscribed" };
  } catch {
    return { ok: false, permission: "granted", reason: "subscribe-failed" };
  }
}

/**
 * Unsubscribes locally AND tells the server, in that order — a subscription
 * the browser has dropped but the server still holds would keep receiving
 * pushes it can never show, until the push service 410s it away.
 */
export async function disablePush() {
  const subscription = await getExistingSubscription();

  if (!subscription) {
    window.localStorage.removeItem(LAST_SENT_KEY);

    return { ok: true, reason: "not-subscribed" };
  }

  const { endpoint } = subscription;

  try {
    await subscription.unsubscribe();
  } catch {
    // Even if the local unsubscribe fails, still deactivate server-side —
    // better a stale browser subscription than a server that keeps pushing.
  }

  try {
    await unsubscribeFromPush(endpoint);
    window.localStorage.removeItem(LAST_SENT_KEY);

    return { ok: true, reason: "unsubscribed" };
  } catch {
    return { ok: false, reason: "request-failed" };
  }
}

export { LAST_SENT_KEY, SW_PATH };
