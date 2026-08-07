import { MIN_SEGMENT_MS, clampToDay, createDayAxis, resolveShiftMs } from "./attendanceDayAxis.js";

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
export function computeTimelineSegments(record, now = Date.now()) {
  const shift = resolveShiftMs(record, now);

  if (!shift) {
    return [];
  }

  const { shiftStartMs, shiftEndMs } = shift;
  const axis = createDayAxis(record);

  // `startMs`/`endMs` ride along on every segment (2026-08-05) so the bar
  // can label each band with the actual clock range it covers on hover,
  // without recomputing any of this geometry a second time in the view.
  const segments = [
    {
      color: "green",
      startMs: shiftStartMs,
      endMs: shiftEndMs,
      ...axis.band(shiftStartMs, shiftEndMs),
    },
  ];

  const breakInMs = record.breakIn?.time ? new Date(record.breakIn.time).getTime() : null;
  const breakOutMs = record.breakOut?.time ? new Date(record.breakOut.time).getTime() : null;

  if (breakInMs != null && breakOutMs != null) {
    const clampedStart = clampToDay(breakInMs, shiftStartMs, shiftEndMs);
    const clampedEnd = clampToDay(breakOutMs, shiftStartMs, shiftEndMs);

    if (clampedEnd - clampedStart >= MIN_SEGMENT_MS) {
      segments.push({
        color: "amber",
        startMs: clampedStart,
        endMs: clampedEnd,
        ...axis.band(clampedStart, clampedEnd),
      });
    }
  }

  (record.connectivityGaps || []).forEach((gap) => {
    const gapStartMs = clampToDay(new Date(gap.start).getTime(), shiftStartMs, shiftEndMs);
    const gapEndMs = clampToDay(new Date(gap.end).getTime(), shiftStartMs, shiftEndMs);

    if (gapEndMs - gapStartMs >= MIN_SEGMENT_MS) {
      segments.push({
        color: "red",
        startMs: gapStartMs,
        endMs: gapEndMs,
        ...axis.band(gapStartMs, gapEndMs),
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
 * Shift / Connected / Not-Tracked for THIS DAY, in milliseconds — the same
 * window `computeTimelineSegments` draws (§7.45). Pass the same `now` to both
 * to guarantee they describe the same instant.
 *
 * All three are `null` only when there is no check-in at all. A still-open
 * shift now reports elapsed-so-far rather than blank: it previously returned
 * nulls (rendering "-") while the bar drew a green band, which is the
 * contradiction this shared window removes. `isOpen`/`isClamped` ride along
 * so the view can say the number is running or day-scoped.
 */
export function computeAttendanceDurations(record, now = Date.now()) {
  const shift = resolveShiftMs(record, now);

  if (!shift) {
    return { shiftMs: null, connectedMs: null, issueMs: null, isOpen: false, isClamped: false };
  }

  // The SAME window the bar draws (§7.45). Previously this measured the raw
  // checkIn -> checkOut span while the bar clamped to the day, so a shift
  // crossing midnight showed a bar ending at midnight beside a "49h 23m"
  // label; and an open shift returned nulls here (rendering "-") while the
  // bar drew a green band. Both disagreements are gone because there is now
  // one window, not two opinions about it.
  const { shiftStartMs, shiftEndMs, isOpen, isClamped } = shift;

  const shiftMs = Math.max(0, shiftEndMs - shiftStartMs);
  const issueMs = sumGapMs(record.connectivityGaps, shiftStartMs, shiftEndMs);

  const breakInMs = record.breakIn?.time ? new Date(record.breakIn.time).getTime() : null;
  const breakOutMs = record.breakOut?.time ? new Date(record.breakOut.time).getTime() : null;
  const breakMs =
    breakInMs != null && breakOutMs != null
      ? Math.max(
          0,
          clampToDay(breakOutMs, shiftStartMs, shiftEndMs) -
            clampToDay(breakInMs, shiftStartMs, shiftEndMs)
        )
      : 0;

  const connectedMs = Math.max(0, shiftMs - issueMs - breakMs);

  return { shiftMs, connectedMs, issueMs, isOpen, isClamped };
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
