/**
 * Derives extra map markers for one Attendance record's connectivity gaps
 * and geofence violations, given the day's already-fetched location pings
 * (`HistoryMapView`'s own `deriveExtraMarkers(pings)` hook) — no new backend
 * endpoint, just plotting what `GET /location/history` already returns.
 *
 * **Connectivity gaps** (`record.connectivityGaps[]`, §6.5) are, by
 * definition, periods with NO pings at all (that's what a gap *is* — a
 * missed heartbeat window) — there's nothing to mark *during* the gap, so
 * this marks its two boundaries instead: the last known ping before
 * connectivity was lost, and the first ping after it came back. Both use
 * `red`, matching `ConnectivityGapBar`'s own established color for this
 * issue type.
 *
 * **Geofence violations** (`record.geofenceViolations[]`) are periods when
 * the device WAS still pinging, just from outside the allowed radius — every
 * ping whose `capturedAt` falls inside the violation window gets marked,
 * using `orange` to match `GeofenceViolationBar`'s own color for this issue
 * type (deliberately distinct from the gap markers' red, the same
 * red-vs-orange distinction those two bar components already establish).
 */
export function deriveAttendanceMapMarkers(record) {
  return function deriveMarkers(pings) {
    if (!pings || pings.length === 0) {
      return [];
    }

    const sortedPings = [...pings].sort((a, b) => new Date(a.capturedAt) - new Date(b.capturedAt));
    const markers = [];

    (record.connectivityGaps || []).forEach((gap) => {
      const gapStartMs = new Date(gap.start).getTime();
      const gapEndMs = new Date(gap.end).getTime();

      const lastBefore = [...sortedPings].reverse().find((ping) => new Date(ping.capturedAt).getTime() <= gapStartMs);
      const firstAfter = sortedPings.find((ping) => new Date(ping.capturedAt).getTime() >= gapEndMs);

      if (lastBefore) {
        markers.push({
          lat: lastBefore.coords.lat,
          lng: lastBefore.coords.lng,
          label: `Connectivity gap started — last known position (${new Date(gap.start).toLocaleTimeString()})`,
          color: "red",
        });
      }

      if (firstAfter) {
        markers.push({
          lat: firstAfter.coords.lat,
          lng: firstAfter.coords.lng,
          label: `Connectivity gap ended — reconnected (${new Date(gap.end).toLocaleTimeString()})`,
          color: "red",
        });
      }
    });

    (record.geofenceViolations || []).forEach((violation) => {
      const violationStartMs = new Date(violation.start).getTime();
      // A still-open violation (`end: null`) is only ever possible for an
      // in-progress shift — this map is only ever shown for a finished
      // shift's record (same precondition `GeofenceViolationBar` itself
      // relies on), but falls back to "no upper bound" defensively rather
      // than crashing on a null `end`.
      const violationEndMs = violation.end ? new Date(violation.end).getTime() : Infinity;

      sortedPings
        .filter((ping) => {
          const capturedAtMs = new Date(ping.capturedAt).getTime();
          return capturedAtMs >= violationStartMs && capturedAtMs <= violationEndMs;
        })
        .forEach((ping) => {
          markers.push({
            lat: ping.coords.lat,
            lng: ping.coords.lng,
            label: `Outside geofence (max ${Math.round(violation.maxDistanceMeters)}m) — ${new Date(ping.capturedAt).toLocaleTimeString()}`,
            color: "orange",
          });
        });
    });

    return markers;
  };
}

export default deriveAttendanceMapMarkers;
