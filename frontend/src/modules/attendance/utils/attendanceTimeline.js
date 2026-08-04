const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * §7.4e (2026-08-04) — replaces the separate "Connectivity Gap"/"Shift
 * Timing" columns (`ConnectivityGapBar`, plus the standalone Check-In/
 * Check-Out/Working Hours columns) with one 24-hour visual timeline per
 * row. Investigation before building this (folded into the same task):
 * those columns were never reading duplicate data — Check-In/Check-Out
 * read `checkIn.time`/`checkOut.time` directly as text, `ConnectivityGapBar`
 * read the same two timestamps only to *scale* its bar, overlaying genuinely
 * distinct `connectivityGaps[]` data — but the visual result (several
 * columns all anchored to the same two timestamps, two of them near-
 * identical-looking colored bars) read as duplication regardless. This
 * timeline consolidates all of it into one visualization instead of
 * disputing the earlier finding.
 *
 * **Shifts can cross midnight** — confirmed by reading the data model, not
 * assumed: `attendance.service.js#checkIn` sets `date: startOfDay(now)` at
 * check-in time, and `checkOut` never validates that `now` falls on the
 * same calendar day, nor caps shift duration. So a shift starting just
 * before midnight can legitimately end after it. This timeline represents
 * exactly one calendar day (`record.date`, midnight to midnight) — a
 * checkout that lands after that day's midnight is **clamped to the end of
 * the bar** (100%) rather than overflowing past it or wrapping onto a
 * second row; there is no "this shift continues on tomorrow's row" marker,
 * since tomorrow's own row already independently reflects whatever
 * `connectivityGaps`/other fields were recorded against that record's own
 * `checkIn`/`checkOut`. In practice a shift that long is rare (the closest
 * real precedent is genuinely a data edge case, not a normal path).
 */

function dayBoundsMs(record) {
  const dayStart = new Date(record.date);
  dayStart.setHours(0, 0, 0, 0);

  return { dayStartMs: dayStart.getTime(), dayEndMs: dayStart.getTime() + DAY_MS };
}

function clampToDay(ms, dayStartMs, dayEndMs) {
  return Math.min(Math.max(ms, dayStartMs), dayEndMs);
}

function toPercent(ms, dayStartMs) {
  return ((ms - dayStartMs) / DAY_MS) * 100;
}

/**
 * Returns an ordered array of `{ color, leftPercent, widthPercent }`
 * segments to render as absolutely-positioned bars over a GRAY base
 * (matching `ConnectivityGapBar`/`GeofenceViolationBar`'s existing
 * left/width-percent technique) — GREEN for connected time, RED for a
 * connectivity gap, AMBER for the break period (`breakIn`–`breakOut`,
 * stated assumption per the task; gray was the stated alternative). Later
 * segments in the array paint over earlier ones at the same position, so
 * order encodes precedence: break (AMBER) is pushed before connectivity
 * gaps (RED) — a gap during a break is rare in real data, but if it
 * happens, the connectivity issue is the more actionable thing to surface,
 * so RED wins.
 */
export function computeTimelineSegments(record) {
  const checkInMs = record.checkIn?.time ? new Date(record.checkIn.time).getTime() : null;
  const checkOutMs = record.checkOut?.time ? new Date(record.checkOut.time).getTime() : null;

  if (checkInMs == null) {
    return [];
  }

  const { dayStartMs, dayEndMs } = dayBoundsMs(record);
  const shiftStartMs = clampToDay(checkInMs, dayStartMs, dayEndMs);
  const shiftEndMs = clampToDay(checkOutMs ?? dayEndMs, dayStartMs, dayEndMs);

  const segments = [
    {
      color: "green",
      leftPercent: toPercent(shiftStartMs, dayStartMs),
      widthPercent: toPercent(shiftEndMs, dayStartMs) - toPercent(shiftStartMs, dayStartMs),
    },
  ];

  const breakInMs = record.breakIn?.time ? new Date(record.breakIn.time).getTime() : null;
  const breakOutMs = record.breakOut?.time ? new Date(record.breakOut.time).getTime() : null;

  if (breakInMs != null && breakOutMs != null) {
    const clampedStart = clampToDay(breakInMs, shiftStartMs, shiftEndMs);
    const clampedEnd = clampToDay(breakOutMs, shiftStartMs, shiftEndMs);

    if (clampedEnd > clampedStart) {
      segments.push({
        color: "amber",
        leftPercent: toPercent(clampedStart, dayStartMs),
        widthPercent: toPercent(clampedEnd, dayStartMs) - toPercent(clampedStart, dayStartMs),
      });
    }
  }

  (record.connectivityGaps || []).forEach((gap) => {
    const gapStartMs = clampToDay(new Date(gap.start).getTime(), shiftStartMs, shiftEndMs);
    const gapEndMs = clampToDay(new Date(gap.end).getTime(), shiftStartMs, shiftEndMs);

    if (gapEndMs > gapStartMs) {
      segments.push({
        color: "red",
        leftPercent: toPercent(gapStartMs, dayStartMs),
        widthPercent: toPercent(gapEndMs, dayStartMs) - toPercent(gapStartMs, dayStartMs),
      });
    }
  });

  return segments;
}

function sumGapMs(gaps, shiftStartMs, shiftEndMs) {
  return (gaps || []).reduce((total, gap) => {
    const gapStartMs = clampToDay(new Date(gap.start).getTime(), shiftStartMs, shiftEndMs);
    const gapEndMs = clampToDay(new Date(gap.end).getTime(), shiftStartMs, shiftEndMs);

    return total + Math.max(0, gapEndMs - gapStartMs);
  }, 0);
}

/**
 * Total Shift Time (check-in to check-out), Total Connected/Normal Time
 * (shift minus gaps minus break), Total Connectivity Issue Time (summed
 * gap durations) — all in raw milliseconds; `formatDuration` below renders
 * them. Returns all three as `null` when there's no check-in/check-out to
 * measure a duration against (an absent day, or a still-open shift).
 */
export function computeAttendanceDurations(record) {
  const checkInMs = record.checkIn?.time ? new Date(record.checkIn.time).getTime() : null;
  const checkOutMs = record.checkOut?.time ? new Date(record.checkOut.time).getTime() : null;

  if (checkInMs == null || checkOutMs == null) {
    return { shiftMs: null, connectedMs: null, issueMs: null };
  }

  const shiftMs = Math.max(0, checkOutMs - checkInMs);
  const issueMs = sumGapMs(record.connectivityGaps, checkInMs, checkOutMs);

  const breakInMs = record.breakIn?.time ? new Date(record.breakIn.time).getTime() : null;
  const breakOutMs = record.breakOut?.time ? new Date(record.breakOut.time).getTime() : null;
  const breakMs = breakInMs != null && breakOutMs != null ? Math.max(0, breakOutMs - breakInMs) : 0;

  const connectedMs = Math.max(0, shiftMs - issueMs - breakMs);

  return { shiftMs, connectedMs, issueMs };
}

/** `8h 15m` — `0m` for a zero duration, `-` for `null`/negative/NaN. */
export function formatDuration(ms) {
  if (ms == null || Number.isNaN(ms) || ms < 0) {
    return "-";
  }

  const totalMinutes = Math.round(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}
