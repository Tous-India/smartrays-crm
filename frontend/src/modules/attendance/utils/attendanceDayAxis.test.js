import { describe, it, expect } from "vitest";
import { createDayAxis, resolveShiftMs, DAY_MS } from "./attendanceDayAxis";

/**
 * The 24-hour axis the timeline bar is drawn against.
 *
 * Introduced in §7.4f to be SHARED with the Location column, which was then
 * still a bar. §7.4g (2026-08-06) replaced that column with a status chip, so
 * only the timeline consumes this now — the cross-column alignment tests went
 * with the bar. The helper stays factored out: the axis is real geometry with
 * real edge cases (midnight bounds, an open shift running to end of day) and
 * deserves direct coverage independent of the component that draws it.
 */

function localDate(hour, minute = 0) {
  return new Date(2026, 5, 1, hour, minute, 0, 0);
}

const FULL_DAY = {
  _id: "att-full",
  date: localDate(0),
  checkIn: { time: localDate(9) },
  checkOut: { time: localDate(18) },
  breakIn: { time: localDate(13) },
  breakOut: { time: localDate(14) },
  connectivityGaps: [{ start: localDate(10, 30), end: localDate(11) }],
  geofenceViolations: [{ start: localDate(10, 30), end: localDate(11), maxDistanceMeters: 250.4 }],
  status: "present",
};

const OPEN_SHIFT = {
  _id: "att-open",
  date: localDate(0),
  checkIn: { time: localDate(9) },
  checkOut: { time: null },
  connectivityGaps: [],
  geofenceViolations: [{ start: localDate(15), end: null, maxDistanceMeters: 800 }],
  status: "present",
};

const NO_CHECK_IN = {
  _id: "att-none",
  date: localDate(0),
  checkIn: { time: null },
  checkOut: { time: null },
  connectivityGaps: [],
  geofenceViolations: [],
  status: "absent",
};

describe("createDayAxis — one 24-hour axis", () => {
  it("maps midnight to 0% and the next midnight to 100%", () => {
    const axis = createDayAxis(FULL_DAY);

    expect(axis.percentOf(axis.dayStartMs)).toBe(0);
    expect(axis.percentOf(axis.dayEndMs)).toBe(100);
    expect(axis.dayEndMs - axis.dayStartMs).toBe(DAY_MS);
  });

  it("puts 09:00 at 37.5% regardless of what the shift is", () => {
    expect(createDayAxis(FULL_DAY).percentOf(localDate(9).getTime())).toBeCloseTo(37.5, 6);
    expect(createDayAxis(OPEN_SHIFT).percentOf(localDate(9).getTime())).toBeCloseTo(37.5, 6);
  });

  it("clamps an open shift to the end of its own day", () => {
    const shift = resolveShiftMs(OPEN_SHIFT);

    expect(shift.isOpen).toBe(true);
    expect(shift.shiftEndMs).toBe(createDayAxis(OPEN_SHIFT).dayEndMs);
  });

  it("returns null when there is no check-in at all", () => {
    expect(resolveShiftMs(NO_CHECK_IN)).toBeNull();
  });
});
