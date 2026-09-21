import { NativeEventEmitter, NativeModules, PermissionsAndroid, Platform } from "react-native";
import { PERMISSION_STATUS, requestPermission } from "../../utils/permissions.utils";

/**
 * THE tracking engine boundary (decided): every screen, store and service
 * talks to tracking through this module and nothing else. Today the engine
 * is the app's own Kotlin foreground service (TrackingService.kt) with a
 * SQLite queue; a different engine — the paid SDK, another library —
 * replaces the body of this file and touches nothing outside it.
 *
 * Contract:
 *   start({ intervalMs })          begin capturing fixes at that cadence
 *   stop()                         end capturing; the persistent notification goes
 *   getStatus()                    { isRunning, queuedCount, lastCapturedAt, intervalMs }
 *   onPing(listener) → unsubscribe a fix was captured (only while JS is alive)
 *   takeQueued(limit) / deleteQueued(ids)   the offline queue, oldest first
 *   pruneCapturedBefore(cutoffMs)  drop fixes the server would purge anyway
 *   permission helpers             the three grants tracking depends on
 *   getFlag / setFlag              small durable flags (disclosure, guidance)
 */

const native = NativeModules.SmartraysTracking;
const PING_EVENT = "SmartraysTracking:ping";

function assertNative() {
  if (!native) {
    throw new Error("SmartraysTracking native module is not linked — rebuild the Android app.");
  }
}

export async function start({ intervalMs }) {
  assertNative();
  await native.start(intervalMs);
}

export async function stop() {
  assertNative();
  await native.stop();
}

export async function getStatus() {
  assertNative();
  const status = await native.getStatus();

  return {
    isRunning: Boolean(status.isRunning),
    queuedCount: Number(status.queuedCount) || 0,
    lastCapturedAt: status.lastCapturedAt ? new Date(status.lastCapturedAt) : null,
    intervalMs: status.intervalMs || null,
  };
}

let emitter = null;

/** Fires with { id, capturedAt, lat, lng, accuracy } for each fix, while JS is alive. */
export function onPing(listener) {
  assertNative();

  if (!emitter) {
    emitter = new NativeEventEmitter(native);
  }

  const subscription = emitter.addListener(PING_EVENT, listener);

  return () => subscription.remove();
}

/** Up to `limit` queued fixes, oldest first: [{ id, capturedAt, lat, lng, accuracy? }]. */
export async function takeQueued(limit) {
  assertNative();
  const json = await native.takeQueued(limit);

  return JSON.parse(json || "[]");
}

export async function deleteQueued(ids) {
  assertNative();

  if (ids.length === 0) {
    return 0;
  }

  return native.deleteQueued(ids);
}

export async function pruneCapturedBefore(cutoffMs) {
  assertNative();

  return native.pruneCapturedBefore(cutoffMs);
}

export async function getFlag(key) {
  assertNative();

  return native.getFlag(key);
}

export async function setFlag(key, value) {
  assertNative();
  await native.setFlag(key, value === undefined ? null : value);
}

// --- Permissions the engine needs, in the order they are asked ---

const FINE_LOCATION = PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION;
const BACKGROUND_LOCATION = PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION;
const NOTIFICATIONS = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;

/** Android 13+ asks for notifications; earlier versions grant them. */
function notificationsNeedAsking() {
  return Platform.OS === "android" && Platform.Version >= 33;
}

/** Android 10+ has a separate background grant; earlier versions fold it into fine location. */
function backgroundNeedsAsking() {
  return Platform.OS === "android" && Platform.Version >= 29;
}

export async function getPermissionState() {
  const fine = await PermissionsAndroid.check(FINE_LOCATION);
  const background = backgroundNeedsAsking() ? await PermissionsAndroid.check(BACKGROUND_LOCATION) : fine;
  const notifications = notificationsNeedAsking() ? await PermissionsAndroid.check(NOTIFICATIONS) : true;

  return { fine, background, notifications };
}

export function requestForegroundLocation() {
  return requestPermission(FINE_LOCATION);
}

export async function requestNotifications() {
  if (!notificationsNeedAsking()) {
    return PERMISSION_STATUS.GRANTED;
  }

  return requestPermission(NOTIFICATIONS);
}

/**
 * On Android 11+ this opens the app's location settings page — the OS no
 * longer shows "Allow all the time" in a dialog — and resolves when the user
 * comes back. The prominent disclosure screen must have been shown first.
 */
export async function requestBackgroundLocation() {
  if (!backgroundNeedsAsking()) {
    return PERMISSION_STATUS.GRANTED;
  }

  return requestPermission(BACKGROUND_LOCATION);
}
