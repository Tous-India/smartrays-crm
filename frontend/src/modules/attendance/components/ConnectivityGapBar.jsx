/**
 * Renders one day's shift as a horizontal bar (green = time worked) with
 * connectivity gaps (`record.connectivityGaps[]`, §6.5) overlaid as visually
 * distinct red segments, proportional to when in the shift they occurred —
 * a specific, real requirement per §7.4's "mark red," not decoration. Falls
 * back to a plain "No connectivity gaps" caption when there are none, and to
 * a simple in-progress note for a still-open shift (no `checkOut.time` yet
 * to measure a duration against).
 */
function ConnectivityGapBar({ record }) {
  const checkInTime = record.checkIn?.time;
  const checkOutTime = record.checkOut?.time;

  if (!checkInTime || !checkOutTime) {
    return <span className="text-gray-400">Shift in progress</span>;
  }

  const shiftStart = new Date(checkInTime).getTime();
  const shiftEnd = new Date(checkOutTime).getTime();
  const totalMs = shiftEnd - shiftStart;

  if (!record.connectivityGaps || record.connectivityGaps.length === 0) {
    return (
      <div className="h-3 w-full rounded bg-green-400" data-testid="connectivity-gap-bar" title="No connectivity gaps" />
    );
  }

  return (
    <div
      className="relative h-3 w-full overflow-hidden rounded bg-green-400"
      data-testid="connectivity-gap-bar"
      title={`${record.connectivityGaps.length} connectivity gap(s)`}
    >
      {record.connectivityGaps.map((gap, index) => {
        const gapStart = new Date(gap.start).getTime();
        const gapEnd = new Date(gap.end).getTime();
        const leftPercent = clampPercent(((gapStart - shiftStart) / totalMs) * 100);
        const widthPercent = clampPercent(((gapEnd - gapStart) / totalMs) * 100);

        return (
          <div
            key={index}
            className="absolute top-0 h-full bg-red-500"
            data-testid="connectivity-gap-segment"
            style={{ left: `${leftPercent}%`, width: `${widthPercent}%` }}
            title={`Gap: ${new Date(gap.start).toLocaleTimeString()} – ${new Date(gap.end).toLocaleTimeString()}`}
          />
        );
      })}
    </div>
  );
}

function clampPercent(value) {
  return Math.min(100, Math.max(0, value));
}

export default ConnectivityGapBar;
