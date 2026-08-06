/**
 * Reduces one attendance record to a single geofence verdict (§7.4g,
 * 2026-08-06) — the Location column is a chip now, not a bar, so what it
 * needs is a value, not geometry.
 *
 * Four states, and the important one is `no_data`. The old bar rendered a
 * shift with no position data identically to one fully inside the geofence:
 * both were solid green. "We never heard where they were" and "they were
 * where they should be" are opposite findings and must not share a colour.
 */

export const GEOFENCE_STATE = {
  NO_DATA: "no_data",
  IN_PROGRESS: "in_progress",
  WITHIN_RANGE: "within_range",
  VIOLATIONS: "violations",
};

/**
 * Metres below 1 km, kilometres to one decimal above it — `840 m`, `1.2 km`.
 * Rounds to the nearest metre first so 999.6 m reads as `1 km`, not `1000 m`.
 */
export function formatDistance(meters) {
  if (meters == null || Number.isNaN(meters) || meters < 0) {
    return null;
  }

  const whole = Math.round(meters);

  if (whole < 1000) {
    return `${whole} m`;
  }

  return `${(whole / 1000).toFixed(1)} km`;
}

/**
 * `summary.state` drives the chip; the rest fills its label and tooltip.
 *
 * **What `no_data` can honestly claim.** Only "there is no check-in on this
 * record", which means nothing was ever tracked. It deliberately does NOT key
 * off missing `checkIn.coords`, even though
 * `attendance.service.js#applyGeofenceCheck` returns immediately without
 * them: `applyVisibilityRules` nulls those same coords for any viewer without
 * the `attendance.view_location` grant, so absence there is indistinguishable
 * from "you are not allowed to see this" — and a manager lacking the grant
 * would otherwise see every row of a perfectly tracked month as "No data".
 * `geofenceViolations` is never stripped, which is why the violation branch
 * runs first and is trustworthy for everyone.
 *
 * **What it still cannot cover.** A shift that checked in and then reported
 * no positions at all. Violations are only ever written from
 * `location.service.js#submitPing`, so a shift with zero pings stores
 * `geofenceViolations: []` — byte-identical to one whose every ping was in
 * range. The record carries no ping count, and heartbeats are a separate loop
 * against a separate endpoint (`lastHeartbeatAt` never moves on a ping), so
 * nothing reachable from this record separates the two. Closing that needs a
 * ping count on the attendance payload — see docs/project-status.md.
 */
export function summarizeGeofence(record) {
  const violations = (record?.geofenceViolations || []).filter(
    (violation) => violation && violation.start
  );

  // First, and before any check-in inspection: a recorded violation proves
  // the geofence WAS evaluated, whatever the payload does or doesn't carry.
  if (violations.length > 0) {
    const maxDistanceMeters = violations.reduce(
      (largest, violation) => Math.max(largest, violation.maxDistanceMeters || 0),
      0
    );

    return {
      state: GEOFENCE_STATE.VIOLATIONS,
      count: violations.length,
      maxDistanceMeters,
      violations,
    };
  }

  if (!record?.checkIn?.time) {
    return { state: GEOFENCE_STATE.NO_DATA, count: 0, maxDistanceMeters: null, violations: [] };
  }

  if (!record?.checkOut?.time) {
    return { state: GEOFENCE_STATE.IN_PROGRESS, count: 0, maxDistanceMeters: null, violations: [] };
  }

  return { state: GEOFENCE_STATE.WITHIN_RANGE, count: 0, maxDistanceMeters: null, violations: [] };
}

/** The chip's own short label. */
export function geofenceChipLabel(summary) {
  switch (summary.state) {
    case GEOFENCE_STATE.NO_DATA:
      return "No data";
    case GEOFENCE_STATE.IN_PROGRESS:
      return "In progress";
    case GEOFENCE_STATE.VIOLATIONS: {
      const noun = summary.count === 1 ? "excursion" : "excursions";
      const distance = formatDistance(summary.maxDistanceMeters);

      return distance
        ? `${summary.count} ${noun} · max ${distance}`
        : `${summary.count} ${noun}`;
    }
    default:
      return "Within range";
  }
}
