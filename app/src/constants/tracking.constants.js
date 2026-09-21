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

export const DISCLOSURE_ANSWERS = {
  ACCEPTED: "accepted",
  DECLINED: "declined",
};
