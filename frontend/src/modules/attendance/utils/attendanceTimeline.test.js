import { describe, it, expect } from "vitest";
import { computeTimelineSegments, computeAttendanceDurations, formatDuration } from "./attendanceTimeline";

// `computeTimelineSegments` derives the day's boundaries from `record.date`
// in LOCAL time (matching how a real user reads "midnight to midnight" in
// their own timezone) — these fixtures use local `new Date(y, m, d, h, min)`
// constructors throughout, rather than UTC ISO strings, so the tests give
// the same result regardless of which timezone they run in.
function localDate(hour, minute = 0, dayOffset = 0) {
  return new Date(2026, 5, 1 + dayOffset, hour, minute, 0, 0);
}

describe("computeTimelineSegments", () => {
  it("returns no segments (fully gray bar) for a record with no check-in at all", () => {
    const record = { date: localDate(0), checkIn: { time: null }, checkOut: { time: null } };

    expect(computeTimelineSegments(record)).toEqual([]);
  });

  it("renders a plain green segment for a normal shift with no gaps/break", () => {
    const record = {
      date: localDate(0),
      checkIn: { time: localDate(9) },
      checkOut: { time: localDate(17) },
      connectivityGaps: [],
    };

    const segments = computeTimelineSegments(record);

    expect(segments).toHaveLength(1);
    expect(segments[0].color).toBe("green");
    expect(segments[0].leftPercent).toBeCloseTo((9 / 24) * 100, 1);
    expect(segments[0].widthPercent).toBeCloseTo((8 / 24) * 100, 1);
  });

  it("overlays a connectivity gap in red and a break in amber, on top of the green base", () => {
    const record = {
      date: localDate(0),
      checkIn: { time: localDate(9) },
      checkOut: { time: localDate(17) },
      connectivityGaps: [{ start: localDate(10), end: localDate(10, 30) }],
      breakIn: { time: localDate(13) },
      breakOut: { time: localDate(13, 30) },
    };

    const segments = computeTimelineSegments(record);
    const colors = segments.map((segment) => segment.color);

    expect(colors).toEqual(["green", "amber", "red"]);

    const gapSegment = segments.find((segment) => segment.color === "red");
    expect(gapSegment.leftPercent).toBeCloseTo((10 / 24) * 100, 1);
    expect(gapSegment.widthPercent).toBeCloseTo((0.5 / 24) * 100, 1);
  });

  it("clamps a checkout that lands after midnight to the end of the bar, not overflowing past it", () => {
    const record = {
      date: localDate(0),
      checkIn: { time: localDate(23) },
      checkOut: { time: localDate(2, 0, 1) }, // 2am the NEXT day
      connectivityGaps: [],
    };

    const segments = computeTimelineSegments(record);

    expect(segments).toHaveLength(1);
    expect(segments[0].leftPercent).toBeCloseTo((23 / 24) * 100, 1);
    // Clamped at the day boundary (100%), not extended past it.
    expect(segments[0].leftPercent + segments[0].widthPercent).toBeCloseTo(100, 1);
  });

  it("treats a still-open shift (no checkout yet) as running to the end of the day", () => {
    const record = {
      date: localDate(0),
      checkIn: { time: localDate(9) },
      checkOut: { time: null },
      connectivityGaps: [],
    };

    const segments = computeTimelineSegments(record);

    expect(segments[0].leftPercent + segments[0].widthPercent).toBeCloseTo(100, 1);
  });
});

describe("computeAttendanceDurations", () => {
  it("returns all nulls for a record with no checkout yet", () => {
    const record = { checkIn: { time: localDate(9) }, checkOut: { time: null } };

    // §7.45 — an open shift now reports elapsed-so-far instead of nulls. It
    // previously rendered three "-" labels beside a green band, which is the
    // contradiction that change removed. Only a record with NO check-in has
    // nothing measurable.
    const { shiftMs, isOpen } = computeAttendanceDurations(record);
    expect(isOpen).toBe(true);
    expect(shiftMs).toBeGreaterThan(0);

    const noCheckIn = { ...record, checkIn: { time: null } };
    expect(computeAttendanceDurations(noCheckIn)).toMatchObject({
      shiftMs: null,
      connectedMs: null,
      issueMs: null,
    });
  });

  it("computes shift/connected/issue durations correctly for a shift with a gap and a break", () => {
    const record = {
      checkIn: { time: localDate(9) },
      checkOut: { time: localDate(17) }, // 8h shift
      connectivityGaps: [{ start: localDate(10), end: localDate(10, 30) }], // 30m
      breakIn: { time: localDate(13) },
      breakOut: { time: localDate(13, 15) }, // 15m
    };

    const { shiftMs, connectedMs, issueMs } = computeAttendanceDurations(record);

    expect(shiftMs).toBe(8 * 60 * 60 * 1000);
    expect(issueMs).toBe(30 * 60 * 1000);
    // 8h - 30m gap - 15m break = 7h15m
    expect(connectedMs).toBe((7 * 60 + 15) * 60 * 1000);
  });

  it("has no break duration when breakIn/breakOut weren't recorded", () => {
    const record = {
      checkIn: { time: localDate(9) },
      checkOut: { time: localDate(17) },
      connectivityGaps: [],
    };

    const { shiftMs, connectedMs, issueMs } = computeAttendanceDurations(record);

    expect(shiftMs).toBe(8 * 60 * 60 * 1000);
    expect(issueMs).toBe(0);
    expect(connectedMs).toBe(shiftMs);
  });
});

describe("formatDuration", () => {
  it("formats hours and minutes", () => {
    expect(formatDuration((8 * 60 + 15) * 60 * 1000)).toBe("8h 15m");
  });

  it("omits the hours part entirely under an hour", () => {
    expect(formatDuration(45 * 60 * 1000)).toBe("45m");
  });

  it("formats a zero duration as 0m, not a dash", () => {
    expect(formatDuration(0)).toBe("0m");
  });

  it("formats null/negative/NaN as a dash", () => {
    expect(formatDuration(null)).toBe("-");
    expect(formatDuration(-1000)).toBe("-");
    expect(formatDuration(NaN)).toBe("-");
  });
});
