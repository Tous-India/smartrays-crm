import * as tracking from "./trackingAdapter";
import { getLocationConfig } from "./locationApi";
import { flushQueue } from "./pingQueue.service";
import { DISCLOSURE_ANSWERS, TRACKING_FLAGS } from "../../constants/tracking.constants";
import { PERMISSION_STATUS } from "../../utils/permissions.utils";

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

export async function getDisclosureAnswer() {
  const flag = await tracking.getFlag(TRACKING_FLAGS.DISCLOSURE);

  if (!flag) {
    return null;
  }

  const [answer, answeredAt] = flag.split("|");

  return { answer, answeredAt };
}

export async function recordDisclosureAnswer(answer) {
  await tracking.setFlag(TRACKING_FLAGS.DISCLOSURE, `${answer}|${new Date().toISOString()}`);
}

/**
 * Whether tracking is allowed to run right now, and if not, why. Requires the
 * disclosure to have been accepted AND the two location grants — a "Not now"
 * on the disclosure keeps tracking off however the OS permissions stand.
 */
export async function getTrackingReadiness() {
  const disclosure = await getDisclosureAnswer();

  if (!disclosure || disclosure.answer !== DISCLOSURE_ANSWERS.ACCEPTED) {
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
