/**
 * The app's own tracking constants. The cadence is NOT here — it comes from
 * GET /location/config; the retention window is the server's (final-plan.md
 * §6.5), quoted in the disclosure copy and used to prune the local queue.
 */

/** The server accepts at most this many pings per batch request. */
export const PING_BATCH_LIMIT = 500;

/** How often the app, while open and online, pushes the queue up. */
export const FLUSH_INTERVAL_MS = 60 * 1000;

/** The server's ping retention — fixes older than this are dropped unsent. */
export const PING_RETENTION_DAYS = 45;

/** Durable flag keys (trackingAdapter.getFlag / setFlag). */
export const TRACKING_FLAGS = {
  DISCLOSURE: "disclosure",
  BATTERY_GUIDANCE: "batteryGuidance",
};

/**
 * The version of the disclosure TEXT (TrackingDisclosureScreen). Bump it when
 * the wording changes and every user is asked again: a decision on older
 * wording is a decision on something else. Recorded with each consent
 * (final-plan.md §7.73).
 */
export const DISCLOSURE_VERSION = "2026-09-21.1";

/** The two decisions the server accepts (`POST /location/consent`). */
export const DISCLOSURE_ANSWERS = {
  GRANTED: "granted",
  DECLINED: "declined",
};
