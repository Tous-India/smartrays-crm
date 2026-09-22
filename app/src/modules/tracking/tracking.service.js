import * as tracking from "./trackingAdapter";
import { getLocationConfig, getMyConsent, recordConsent } from "./locationApi";
import { flushQueue } from "./pingQueue.service";
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
};

let cachedIntervalMs = null;

/** The cadence is the server's (`GET /location/config`), fetched once per session. */
async function resolveIntervalMs() {
  if (cachedIntervalMs) {
    return cachedIntervalMs;
  }

  const response = await getLocationConfig();
  cachedIntervalMs = Number(response.data.data.pingIntervalMinutes) * 60 * 1000;

  return cachedIntervalMs;
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
 * however the OS permissions stand.
 */
export async function getTrackingReadiness() {
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

  const readiness = await getTrackingReadiness();

  if (!readiness.ready) {
    if (status.isRunning) {
      await tracking.stop();
    }

    return;
  }

  if (!status.isRunning) {
    await tracking.start({ intervalMs: await resolveIntervalMs() });
  }
}

/** What the shift card shows. */
export async function getTrackingState(openRecord) {
  if (!openRecord) {
    return { status: TRACKING_STATUS.OFF, reason: null, queuedCount: 0, lastCapturedAt: null };
  }

  const [readiness, status] = await Promise.all([getTrackingReadiness(), tracking.getStatus()]);

  if (!readiness.ready) {
    return { status: TRACKING_STATUS.PAUSED, reason: readiness.reason, queuedCount: status.queuedCount, lastCapturedAt: status.lastCapturedAt };
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
