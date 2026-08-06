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

/** Local midnight → next local midnight for the record's own day. */
export function dayBoundsMs(record) {
  const dayStart = new Date(record.date);
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
 * The shift window as milliseconds, clamped to the record's own day.
 *
 * An open shift (no checkout yet) runs to the end of the day, matching how
 * the timeline has always drawn one — both bars therefore end an in-progress
 * shift at the same x-offset instead of disagreeing about it. Returns `null`
 * when there is no check-in at all, which both bars render as a bare gray
 * bar with no segments.
 */
export function resolveShiftMs(record) {
  const checkInMs = record.checkIn?.time ? new Date(record.checkIn.time).getTime() : null;

  if (checkInMs == null) {
    return null;
  }

  const { dayStartMs, dayEndMs } = dayBoundsMs(record);
  const checkOutMs = record.checkOut?.time ? new Date(record.checkOut.time).getTime() : null;

  return {
    shiftStartMs: clampToDay(checkInMs, dayStartMs, dayEndMs),
    shiftEndMs: clampToDay(checkOutMs ?? dayEndMs, dayStartMs, dayEndMs),
    isOpen: checkOutMs == null,
  };
}
