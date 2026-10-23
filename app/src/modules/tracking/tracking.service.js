import * as tracking from "./trackingAdapter";
import { getLocationConfig, getMyConsent, recordConsent } from "./locationApi";
import { flushQueue } from "./pingQueue.service";
import { getMyAttendance } from "../attendance/api/attendanceApi";
import { findOpenRecord, monthKey } from "../attendance/attendance.utils";
import { getDeviceId } from "../../store/tokenStorage";
import { DISCLOSURE_ANSWERS, DISCLOSURE_VERSION, TRACKING_FLAGS } from "../../constants/tracking.constants";
import { PERMISSION_STATUS } from "../../utils/permissions.utils";
import packageJson from "../../../package.json";

/**
 * When tracking runs, and what the shift card says about it (app-plan.md
 * §1.1, §1.3). The one rule: tracking runs ONLY while the user has an open
 * shift — started after a check-in, stopped after a check-out, resumed on
 * relaunch while a shift is still open, and never otherwise. Whether a
 * shift is open is the server's answer (`GET /attendance/me`), passed in by
 * the caller; this module never guesses.
 */
export const TRACKING_STATUS = {
  TRACKING: "tracking",
  PAUSED: "paused",
  OFF: "off",
};

export const PAUSE_REASONS = {
  DECLINED: "declined",
  UNANSWERED: "unanswered",
  PERMISSION: "permission",
  // The forgotten check-out (final-plan.md §7.74): the shift has been open
  // longer than the server's TRACKING_STOP_AFTER_HOURS, so tracking stopped
  // on its own — the shift itself is still open and needs a check-out.
  SHIFT_TOO_LONG: "shift_too_long",
  // Location switched off in the phone's settings (2026-10-23): the engine
  // runs but can get no fix — the manager sees "Location off".
  LOCATION_OFF: "location_off",
};

let cachedConfig = null;

/**
 * The server's tracking figures (`GET /location/config`), fetched once per
 * session: the cadence, and how long a shift may run before the app stops
 * tracking it. Nothing here is decided on the device.
 */
async function resolveConfig() {
  if (cachedConfig) {
    return cachedConfig;
  }

  const response = await getLocationConfig();
  const config = response.data.data;
  cachedConfig = {
    intervalMs: Number(config.pingIntervalMinutes) * 60 * 1000,
    trackingStopAfterHours: Number(config.trackingStopAfterHours) || 12,
  };

  return cachedConfig;
}

/** Tests: forget the cached figures. */
export function clearTrackingConfigCache() {
  cachedConfig = null;
}

/** How many hours a shift has been open, from its check-in. */
export function hoursOpen(openRecord, now = new Date()) {
  if (!openRecord?.checkIn?.time) {
    return 0;
  }

  return (now.getTime() - new Date(openRecord.checkIn.time).getTime()) / 3600000;
}

/**
 * The device-side cache of the server's consent record (final-plan.md
 * §7.73): `decision|disclosureVersion|recordedAt`. The server is the source;
 * this is what the app reads between syncs and while offline.
 */
function parseCachedConsent(flag) {
  if (!flag) {
    return null;
  }

  const [answer, version, answeredAt] = flag.split("|");

  return { answer, version, answeredAt };
}

async function cacheConsent(answer, version, answeredAt) {
  await tracking.setFlag(TRACKING_FLAGS.DISCLOSURE, `${answer}|${version}|${answeredAt}`);
}

/**
 * The decision that applies to the CURRENT disclosure text, or null when the
 * user has to be asked: never answered, or answered an older wording.
 */
export async function getDisclosureAnswer() {
  const cached = parseCachedConsent(await tracking.getFlag(TRACKING_FLAGS.DISCLOSURE));

  if (!cached || cached.version !== DISCLOSURE_VERSION) {
    return null;
  }

  return cached;
}

/**
 * Records the decision on the server — the record anyone can later point
 * to — and caches it. The disclosure only shows before a check-in, which
 * itself needs the server, so a failed record is surfaced to the caller
 * rather than kept locally as if it counted.
 */
export async function recordDisclosureAnswer(answer) {
  const response = await recordConsent({
    decision: answer,
    disclosureVersion: DISCLOSURE_VERSION,
    appVersion: packageJson.version,
    deviceId: await getDeviceId(),
  });

  const record = response.data.data;
  await cacheConsent(record.decision, record.disclosureVersion, record.recordedAt);

  return record;
}

/**
 * On sign-in and launch: the server's latest decision replaces the cache, so
 * a reinstall — or a decision made on another phone — is honoured, and a
 * decision on an older wording shows up as "ask again" through the version.
 */
export async function syncConsentFromServer() {
  const response = await getMyConsent();
  const record = response.data.data;

  if (!record) {
    await tracking.setFlag(TRACKING_FLAGS.DISCLOSURE, null);
    return null;
  }

  await cacheConsent(record.decision, record.disclosureVersion, record.recordedAt);

  return record;
}

/**
 * Whether tracking is allowed to run right now, and if not, why. Requires the
 * current disclosure to have been GRANTED and the two location grants — a
 * "Not now", or no answer yet to the current wording, keeps tracking off
 * however the OS permissions stand. A shift open longer than the server's
 * TRACKING_STOP_AFTER_HOURS (§7.74) is not tracked either: the disclosure
 * promised tracking "only during a checked-in shift", and a shift nobody
 * closed is not one anybody is working. `hoursLimit` rides along so the
 * card can say how long is too long.
 */
export async function getTrackingReadiness(openRecord = null) {
  const disclosure = await getDisclosureAnswer();

  if (!disclosure) {
    return { ready: false, reason: PAUSE_REASONS.UNANSWERED };
  }

  if (disclosure.answer !== DISCLOSURE_ANSWERS.GRANTED) {
    return { ready: false, reason: PAUSE_REASONS.DECLINED };
  }

  const permissions = await tracking.getPermissionState();

  if (!permissions.fine || !permissions.background) {
    return { ready: false, reason: PAUSE_REASONS.PERMISSION };
  }

  if (openRecord) {
    const { trackingStopAfterHours } = await resolveConfig();

    if (hoursOpen(openRecord) >= trackingStopAfterHours) {
      return { ready: false, reason: PAUSE_REASONS.SHIFT_TOO_LONG, hoursLimit: trackingStopAfterHours };
    }
  }

  return { ready: true, reason: null };
}

/**
 * Brings the engine in line with the shift: running while a shift is open
 * and tracking is allowed, stopped otherwise. Safe to call as often as the
 * caller likes — start is idempotent in the engine, and a stop with nothing
 * running is nothing. A check-out also pushes whatever is still queued.
 */
export async function syncTrackingWithShift(openRecord) {
  const status = await tracking.getStatus();

  if (!openRecord) {
    if (status.isRunning) {
      await tracking.stop();
    }

    flushQueue().catch(() => {});
    return;
  }

  const readiness = await getTrackingReadiness(openRecord);
  await reportPermissionChange(readiness);

  if (!readiness.ready) {
    if (status.isRunning) {
      await tracking.stop();
    }

    return;
  }

  if (!status.isRunning) {
    await tracking.start({ intervalMs: (await resolveConfig()).intervalMs });
  }
}

/**
 * Live status (2026-10-23): a location permission taken away during a shift
 * is a "location off" for the manager, given back a "location on" — queued
 * once each (a flag remembers which was last) and sent with the next flush.
 * Turning the GPS itself off is noticed by the service (TrackingService.kt).
 */
async function reportPermissionChange(readiness) {
  const reported = Boolean(await tracking.getFlag(TRACKING_FLAGS.PERMISSION_OFF_REPORTED));
  const missing = readiness.reason === PAUSE_REASONS.PERMISSION;

  if (missing === reported) {
    return;
  }

  await tracking.addStatusEvent(missing ? "location_off" : "location_on", missing ? "permission_revoked" : null);
  await tracking.setFlag(TRACKING_FLAGS.PERMISSION_OFF_REPORTED, missing ? "1" : null);
  flushQueue().catch(() => {});
}

/**
 * The server's word on the shift, then the engine brought in line with it.
 * Used where local state alone must not be trusted: the headless flush after
 * a reboot (the boot receiver restarted the engine from a saved flag), and
 * any run while the app is closed — a shift closed from the web, or
 * auto-closed, stops tracking within a flush interval.
 */
export async function reconcileWithServer() {
  const response = await getMyAttendance(monthKey());
  const openRecord = findOpenRecord(response.data.data);

  await syncTrackingWithShift(openRecord);

  return openRecord;
}

/** What the shift card shows. */
export async function getTrackingState(openRecord) {
  if (!openRecord) {
    return { status: TRACKING_STATUS.OFF, reason: null, queuedCount: 0, lastCapturedAt: null };
  }

  const [readiness, status] = await Promise.all([getTrackingReadiness(openRecord), tracking.getStatus()]);

  if (!readiness.ready) {
    return {
      status: TRACKING_STATUS.PAUSED,
      reason: readiness.reason,
      hoursLimit: readiness.hoursLimit || null,
      queuedCount: status.queuedCount,
      lastCapturedAt: status.lastCapturedAt,
    };
  }

  if (status.isRunning && status.locationOn === false) {
    return { status: TRACKING_STATUS.PAUSED, reason: PAUSE_REASONS.LOCATION_OFF, queuedCount: status.queuedCount, lastCapturedAt: status.lastCapturedAt };
  }

  return {
    status: status.isRunning ? TRACKING_STATUS.TRACKING : TRACKING_STATUS.PAUSED,
    reason: status.isRunning ? null : PAUSE_REASONS.PERMISSION,
    queuedCount: status.queuedCount,
    lastCapturedAt: status.lastCapturedAt,
  };
}

/**
 * The permission sequence behind the disclosure's "Continue" (decided order):
 * foreground location → notifications (Android 13+) → background location.
 * One dialog at a time; each answer is reported so the caller can say what
 * is still missing.
 */
export async function requestTrackingPermissions() {
  const fine = await tracking.requestForegroundLocation();

  if (fine !== PERMISSION_STATUS.GRANTED) {
    return { fine, notifications: null, background: null };
  }

  const notifications = await tracking.requestNotifications();
  const background = await tracking.requestBackgroundLocation();

  return { fine, notifications, background };
}
