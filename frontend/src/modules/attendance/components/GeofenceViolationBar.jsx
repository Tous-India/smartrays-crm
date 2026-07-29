/**
 * Renders one day's shift as a horizontal bar (green = within the geofence)
 * with geofence violations (`record.geofenceViolations[]`, added later,
 * §6.5/§7.4) overlaid as distinct segments, proportional to when in the
 * shift they occurred — the exact same visual treatment (and component
 * shape) as `ConnectivityGapBar`, deliberately reused rather than a new
 * pattern invented from scratch. Uses **orange**, not the same red
 * `ConnectivityGapBar` uses, so the two issue types stay visually distinct
 * at a glance — that distinction is the whole reason this is a separate
 * component/column ("Location") rather than overlaid onto the same bar.
 *
 * A violation can be genuinely still-open (`end: null` — the ping stream is
 * live, unlike connectivityGaps which are always recorded already-closed)
 * for an in-progress shift; for a finished shift (the only case this bar
 * ever renders, same early-return as `ConnectivityGapBar`), `checkOut`
 * always force-closes any still-open window, but this falls back to the
 * shift's own end as a defensive clamp rather than crashing on a `null` end.
 */
function GeofenceViolationBar({ record }) {
  const checkInTime = record.checkIn?.time;
  const checkOutTime = record.checkOut?.time;

  if (!checkInTime || !checkOutTime) {
    return <span className="text-gray-400">Shift in progress</span>;
  }

  const shiftStart = new Date(checkInTime).getTime();
  const shiftEnd = new Date(checkOutTime).getTime();
  const totalMs = shiftEnd - shiftStart;
  const violations = record.geofenceViolations || [];

  if (violations.length === 0) {
    return (
      <div
        className="h-3 w-full rounded bg-green-400"
        data-testid="geofence-violation-bar"
        title="No location violations"
      />
    );
  }

  return (
    <div
      className="relative h-3 w-full overflow-hidden rounded bg-green-400"
      data-testid="geofence-violation-bar"
      title={`${violations.length} location violation(s)`}
    >
      {violations.map((violation, index) => {
        const violationStart = new Date(violation.start).getTime();
        const violationEnd = violation.end ? new Date(violation.end).getTime() : shiftEnd;
        const leftPercent = clampPercent(((violationStart - shiftStart) / totalMs) * 100);
        const widthPercent = clampPercent(((violationEnd - violationStart) / totalMs) * 100);

        return (
          <div
            key={index}
            className="absolute top-0 h-full bg-orange-500"
            data-testid="geofence-violation-segment"
            style={{ left: `${leftPercent}%`, width: `${widthPercent}%` }}
            title={`Location: outside geofence ${new Date(violation.start).toLocaleTimeString()} – ${
              violation.end ? new Date(violation.end).toLocaleTimeString() : "checkout"
            } (max ${Math.round(violation.maxDistanceMeters)}m from check-in)`}
          />
        );
      })}
    </div>
  );
}

function clampPercent(value) {
  return Math.min(100, Math.max(0, value));
}

export default GeofenceViolationBar;
