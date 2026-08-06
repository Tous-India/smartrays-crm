import { describe, it, expect } from "vitest";
import { computeTimelineSegments } from "./attendanceTimeline";
import { computeGeofenceSegments } from "./attendanceGeofence";
import { createDayAxis, resolveShiftMs, DAY_MS } from "./attendanceDayAxis";

/**
 * §7.4f (2026-08-06) — the Timeline and Location columns sit side by side in
 * one table row, so they must place the same clock time at the same
 * x-offset. They previously did not: Timeline measured midnight→midnight
 * while Location stretched check-in→check-out across the full width, making
 * the halfway mark 12:00 in one column and 13:30 in the other.
 *
 * These assert the shared axis directly, so a future change that gives
 * either column its own geometry again fails here rather than in someone's
 * eyes.
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

const find = (segments, predicate) => segments.find(predicate);

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

describe("Timeline and Location share the axis", () => {
  it("places the shift at the SAME left/width in both columns", () => {
    const timelineShift = find(computeTimelineSegments(FULL_DAY), (s) => s.color === "green");
    const locationShift = find(computeGeofenceSegments(FULL_DAY), (s) => s.kind === "inside");

    expect(locationShift.leftPercent).toBeCloseTo(timelineShift.leftPercent, 6);
    expect(locationShift.widthPercent).toBeCloseTo(timelineShift.widthPercent, 6);
    // 09:00–18:00 of a 24-hour day.
    expect(timelineShift.leftPercent).toBeCloseTo(37.5, 6);
    expect(timelineShift.widthPercent).toBeCloseTo(37.5, 6);
  });

  it("places an event at the same x-offset in both columns", () => {
    // The gap and the violation cover the identical 10:30–11:00 window, so
    // they must line up vertically. Before the shared axis the violation
    // landed at (10.5-9)/9 = 16.7% while the gap landed at 43.75%.
    const gap = find(computeTimelineSegments(FULL_DAY), (s) => s.color === "red");
    const violation = find(computeGeofenceSegments(FULL_DAY), (s) => s.kind === "outside");

    expect(violation.leftPercent).toBeCloseTo(gap.leftPercent, 6);
    expect(violation.widthPercent).toBeCloseTo(gap.widthPercent, 6);
    expect(violation.leftPercent).toBeCloseTo(43.75, 6);
  });

  it("ends an open shift at the same x-offset in both columns", () => {
    const timelineShift = find(computeTimelineSegments(OPEN_SHIFT), (s) => s.color === "green");
    const locationShift = find(computeGeofenceSegments(OPEN_SHIFT), (s) => s.kind === "inside");

    expect(locationShift.leftPercent).toBeCloseTo(timelineShift.leftPercent, 6);
    expect(locationShift.widthPercent).toBeCloseTo(timelineShift.widthPercent, 6);
    // 09:00 to midnight.
    expect(locationShift.widthPercent).toBeCloseTo(62.5, 6);
  });

  it("renders no segments in EITHER column when there is no check-in", () => {
    expect(computeTimelineSegments(NO_CHECK_IN)).toEqual([]);
    expect(computeGeofenceSegments(NO_CHECK_IN)).toEqual([]);
  });
});

describe("computeGeofenceSegments", () => {
  it("never covers the whole day — the off-shift hours carry no segment", () => {
    const inside = find(computeGeofenceSegments(FULL_DAY), (s) => s.kind === "inside");

    // The old bar was green end-to-end, claiming "inside the geofence" for
    // the entire night. Anything at 0%/100% here is that bug returning.
    expect(inside.leftPercent).toBeGreaterThan(0);
    expect(inside.leftPercent + inside.widthPercent).toBeLessThan(100);
  });

  it("carries the distance and the real clock range on a violation", () => {
    const violation = find(computeGeofenceSegments(FULL_DAY), (s) => s.kind === "outside");

    expect(violation.maxDistanceMeters).toBe(250.4);
    expect(violation.startMs).toBe(localDate(10, 30).getTime());
    expect(violation.endMs).toBe(localDate(11).getTime());
  });

  it("closes a still-open violation at the end of the shift", () => {
    const violation = find(computeGeofenceSegments(OPEN_SHIFT), (s) => s.kind === "outside");

    expect(violation.endMs).toBe(resolveShiftMs(OPEN_SHIFT).shiftEndMs);
    expect(violation.widthPercent).toBeGreaterThan(0);
  });

  it("drops a zero-length or inverted violation rather than rendering it", () => {
    const segments = computeGeofenceSegments({
      ...FULL_DAY,
      geofenceViolations: [{ start: localDate(12), end: localDate(12), maxDistanceMeters: 10 }],
    });

    expect(segments.filter((s) => s.kind === "outside")).toHaveLength(0);
  });

  it("clamps a violation that starts before check-in into the shift", () => {
    const segments = computeGeofenceSegments({
      ...FULL_DAY,
      geofenceViolations: [{ start: localDate(2), end: localDate(10), maxDistanceMeters: 40 }],
    });
    const violation = find(segments, (s) => s.kind === "outside");

    expect(violation.startMs).toBe(localDate(9).getTime());
  });
});
