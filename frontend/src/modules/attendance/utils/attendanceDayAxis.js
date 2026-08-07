export const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The ONE 24-hour axis every per-day attendance bar is drawn against (§7.4f,
 * 2026-08-06).
 *
 * This exists because it didn't. `AttendanceTimelineBar` measured a full
 * calendar day (midnight → midnight) while `GeofenceViolationBar` stretched
 * check-in → check-out across the whole width, each computing its own
 * geometry. The two columns sit side by side in the same table row, so the
 * same x-offset meant two different clock times: on a 09:00–18:00 shift the
 * halfway mark was 12:00 noon in one column and 13:30 in the other. Anyone
 * comparing a red band in one against an orange band in the other was reading
 * a correlation that wasn't there.
 *
 * Two components independently deriving a day axis is exactly how they
 * drifted apart, so neither derives one any more — both call this.
 */

/**
 * Local midnight → next local midnight for the record's own day.
 *
 * Falls back to the CHECK-IN's own day when `record.date` is missing or
 * unparseable. `date` is required by the Attendance model so real records
 * always carry it, but `computeAttendanceDurations` only started needing a
 * day boundary in §7.45 — before that it measured raw timestamps — and
 * returning `NaN` for a record that still has perfectly good check-in/out
 * times would be a silent regression rather than an honest one.
 */
export function dayBoundsMs(record) {
  const explicit = record?.date != null ? new Date(record.date) : null;
  const source =
    explicit && !Number.isNaN(explicit.getTime())
      ? explicit
      : record?.checkIn?.time
        ? new Date(record.checkIn.time)
        : null;

  if (!source || Number.isNaN(source.getTime())) {
    return { dayStartMs: Number.NaN, dayEndMs: Number.NaN };
  }

  const dayStart = new Date(source);
  dayStart.setHours(0, 0, 0, 0);

  return { dayStartMs: dayStart.getTime(), dayEndMs: dayStart.getTime() + DAY_MS };
}

export function clampToDay(ms, dayStartMs, dayEndMs) {
  return Math.min(Math.max(ms, dayStartMs), dayEndMs);
}

/**
 * An axis bound to one record. `band()` returns the `left`/`width`
 * percentages a bar segment renders with, so a caller never does percentage
 * arithmetic itself.
 */
export function createDayAxis(record) {
  const { dayStartMs, dayEndMs } = dayBoundsMs(record);

  const percentOf = (ms) => ((ms - dayStartMs) / DAY_MS) * 100;

  return {
    dayStartMs,
    dayEndMs,
    clamp: (ms) => clampToDay(ms, dayStartMs, dayEndMs),
    percentOf,
    band: (startMs, endMs) => ({
      leftPercent: percentOf(startMs),
      widthPercent: percentOf(endMs) - percentOf(startMs),
    }),
  };
}

/**
 * The shift window for ONE day, clamped to that day's bounds (§7.45,
 * 2026-08-06).
 *
 * **This is the single source of truth for "how much of this shift belongs to
 * this row", and both the bar and the summary labels now derive from it.**
 * They used to decide independently and diverged: `computeTimelineSegments`
 * clamped to the day while `computeAttendanceDurations` measured the raw
 * `checkIn -> checkOut` span, so a shift running past midnight drew a bar
 * ending at midnight beside a label reading "Shift: 49h 23m".
 *
 * **A row reports THAT DAY's portion, not the full span.** The row is a day —
 * its date column, its 24-hour bar and its stats all describe one calendar
 * day, so a 49-hour shift contributes only its slice to each day it touches.
 * The full span is still recoverable: `workingHours` is computed once at
 * checkout from the untouched timestamps, and neither of these functions
 * writes to it, so payroll's basis is unaffected.
 *
 * An OPEN shift ends at `min(now, end of day)`. On a past day that is the
 * day's end; on today it is the current moment, so an in-progress shift
 * reports elapsed-so-far rather than optimistically claiming tracked time
 * that has not happened yet.
 *
 * Returns `null` when there is no check-in, which both bars render as a bare
 * gray bar and the summary reports as no measurable time.
 */
export function resolveShiftMs(record, now = Date.now()) {
  const checkInMs = record.checkIn?.time ? new Date(record.checkIn.time).getTime() : null;

  if (checkInMs == null) {
    return null;
  }

  const { dayStartMs, dayEndMs } = dayBoundsMs(record);
  const checkOutMs = record.checkOut?.time ? new Date(record.checkOut.time).getTime() : null;
  const openEndMs = Math.min(now, dayEndMs);

  return {
    shiftStartMs: clampToDay(checkInMs, dayStartMs, dayEndMs),
    shiftEndMs: clampToDay(checkOutMs ?? openEndMs, dayStartMs, dayEndMs),
    isOpen: checkOutMs == null,
    // True when the shift extends beyond this row's day, so callers can say
    // the labels describe this day only.
    isClamped: (checkOutMs ?? openEndMs) > dayEndMs || checkInMs < dayStartMs,
  };
}

/**
 * Bands shorter than this are not rendered. Two real records have
 * `breakIn`/`breakOut` seconds apart, producing a 0.004%-wide sliver that
 * cannot be seen, cannot be hovered, and only adds noise. One minute is
 * 0.069% of a 24-hour bar — still small, but the smallest thing worth drawing.
 */
export const MIN_SEGMENT_MS = 60 * 1000;
