/**
 * Was this instant inside a recorded geofence violation window? Used to
 * surface a breach ON the shift-endpoint marker itself rather than only as a
 * separate ping marker somewhere along the trail.
 *
 * A still-open violation (`end: null`) is treated as unbounded — the same
 * defensive reading the ping loop below already uses.
 */
function violationCovering(record, timeValue) {
  if (!timeValue) {
    return null;
  }

  const atMs = new Date(timeValue).getTime();

  return (
    (record.geofenceViolations || []).find((violation) => {
      const startMs = new Date(violation.start).getTime();
      const endMs = violation.end ? new Date(violation.end).getTime() : Infinity;

      return atMs >= startMs && atMs <= endMs;
    }) || null
  );
}

/**
 * The two shift endpoints (§7.66). Derived from the RECORD, not from the
 * pings — a shift always has a check-in position, but may have no pings at
 * all (a device that never reported, or a shift shorter than one ping
 * interval), and those endpoints are exactly the points worth seeing when
 * there is no trail to look at.
 *
 * A missing `checkOut.coords` yields NO second marker. An in-progress shift
 * genuinely has no end point, and inventing one — snapping to the last ping,
 * or reusing the check-in — would assert a place the employee was not known
 * to be.
 */
function deriveShiftEndpointMarkers(record) {
  const markers = [];

  const endpoints = [
    { key: "checkIn", event: record.checkIn, label: "Check-in", shape: "checkin", color: "green" },
    { key: "checkOut", event: record.checkOut, label: "Check-out", shape: "checkout", color: "purple" },
  ];

  endpoints.forEach(({ event, label, shape, color }) => {
    const coords = event?.coords;

    if (!coords || typeof coords.lat !== "number" || typeof coords.lng !== "number") {
      return;
    }

    const breach = violationCovering(record, event.time);

    markers.push({
      lat: coords.lat,
      lng: coords.lng,
      shape,
      color,
      label,
      detail: event.time ? new Date(event.time).toLocaleString() : "Time not recorded",
      note: breach
        ? `Outside geofence at this point (max ${Math.round(breach.maxDistanceMeters)}m)`
        : undefined,
    });
  });

  return markers;
}

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
 *
 * **Shift endpoints** (§7.66) are added by `deriveShiftEndpointMarkers` above
 * and, unlike everything else here, do NOT depend on the pings.
 */
export function deriveAttendanceMapMarkers(record) {
  return function deriveMarkers(pings) {
    // The endpoints do not depend on pings, so they are derived first and
    // returned even when the day's trail is empty.
    const markers = deriveShiftEndpointMarkers(record);

    if (!pings || pings.length === 0) {
      return markers;
    }

    const sortedPings = [...pings].sort((a, b) => new Date(a.capturedAt) - new Date(b.capturedAt));

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
