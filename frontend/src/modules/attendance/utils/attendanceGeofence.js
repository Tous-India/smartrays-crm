import { createDayAxis, clampToDay, resolveShiftMs } from "./attendanceDayAxis.js";

/**
 * Location-column segments for one day (§7.4f, 2026-08-06), drawn against the
 * SAME 24-hour axis as the timeline column via `createDayAxis` — see
 * `attendanceDayAxis.js` for why that sharing is the whole point.
 *
 * Two band types, both inside the shift window:
 *
 * - `inside`  — checked in and within the geofence radius of the check-in
 *   point.
 * - `outside` — an entry in `record.geofenceViolations[]`, painted over the
 *   `inside` band the same way the timeline paints gaps over connected time.
 *
 * Everything outside check-in → check-out gets NO segment at all, so the
 * bar's own gray background shows through. That is deliberate: the old bar
 * was green end-to-end and therefore claimed "inside the geofence" for hours
 * nobody was working, including the entire night.
 *
 * **Known limitation (documented, not fixed here — see
 * docs/project-status.md):** this reads `geofenceViolations[]` only, never
 * `LocationPing`. A stretch with no pings at all renders identically to one
 * fully inside the geofence, so "device silent" and "device present and
 * compliant" are indistinguishable.
 */
export function computeGeofenceSegments(record) {
  const shift = resolveShiftMs(record);

  if (!shift) {
    return [];
  }

  const { shiftStartMs, shiftEndMs } = shift;
  const axis = createDayAxis(record);

  const segments = [
    {
      kind: "inside",
      startMs: shiftStartMs,
      endMs: shiftEndMs,
      ...axis.band(shiftStartMs, shiftEndMs),
    },
  ];

  (record.geofenceViolations || []).forEach((violation) => {
    const startMs = clampToDay(new Date(violation.start).getTime(), shiftStartMs, shiftEndMs);
    // A violation can still be open (`end: null`) on an in-progress shift —
    // the ping stream is live, unlike connectivityGaps which are always
    // recorded already-closed. Falls back to the shift's own end.
    const rawEnd = violation.end ? new Date(violation.end).getTime() : shiftEndMs;
    const endMs = clampToDay(rawEnd, shiftStartMs, shiftEndMs);

    if (endMs > startMs) {
      segments.push({
        kind: "outside",
        startMs,
        endMs,
        maxDistanceMeters: violation.maxDistanceMeters,
        ...axis.band(startMs, endMs),
      });
    }
  });

  return segments;
}
