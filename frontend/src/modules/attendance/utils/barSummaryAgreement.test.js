import { describe, it, expect } from "vitest";
import { computeTimelineSegments, computeAttendanceDurations, formatDuration } from "./attendanceTimeline";
import { MIN_SEGMENT_MS } from "./attendanceDayAxis";

/**
 * §7.45 (2026-08-06) — the bar and its own summary labels must describe the
 * SAME window.
 *
 * Every case here asserts both against ONE fixture at ONE instant, rather
 * than testing the two functions separately. Testing them apart is exactly
 * how they diverged: each was individually defensible, and together they
 * contradicted — a bar ending at midnight beside "Shift: 49h 23m", and a
 * green band beside three "-" labels.
 */

function local(y, m, d, h = 0, min = 0) {
  return new Date(y, m, d, h, min, 0, 0);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** What the bar actually shows for the shift, as a span of the 24h axis. */
function greenSpan(record, now) {
  const green = computeTimelineSegments(record, now).find((s) => s.color === "green");

  return green ? { left: green.leftPercent, width: green.widthPercent, startMs: green.startMs, endMs: green.endMs } : null;
}

/** The same shift expressed as a percentage of the day, from the SUMMARY. */
function summaryWidthPercent(record, now) {
  const { shiftMs } = computeAttendanceDurations(record, now);

  return shiftMs == null ? null : (shiftMs / DAY_MS) * 100;
}

describe("A normal single-day shift — bar and summary agree", () => {
  const NOW = local(2026, 5, 1, 20).getTime();
  const RECORD = {
    _id: "normal",
    date: local(2026, 5, 1),
    checkIn: { time: local(2026, 5, 1, 9) },
    checkOut: { time: local(2026, 5, 1, 17) },
    connectivityGaps: [],
  };

  it("the green band's width equals the Shift label, as a share of the day", () => {
    const bar = greenSpan(RECORD, NOW);
    const summary = summaryWidthPercent(RECORD, NOW);

    expect(bar.width).toBeCloseTo(summary, 6);
    expect(formatDuration(computeAttendanceDurations(RECORD, NOW).shiftMs)).toBe("8h 0m");
    expect(bar.left).toBeCloseTo(37.5, 6);
  });
});

/**
 * The reported bug: 04 Aug drew a bar ending at midnight beside a label
 * reading "Shift: 49h 23m".
 *
 * DECISION: a row reports THAT DAY's portion, because the row IS a day — its
 * date column, its 24-hour bar and its stats all describe one calendar day.
 * The full span stays recoverable from `workingHours`, computed once at
 * checkout from the untouched timestamps, so payroll's basis is unaffected.
 */
describe("A shift crossing midnight — reports THIS DAY's portion in both", () => {
  const NOW = local(2026, 5, 3, 12).getTime();
  const RECORD = {
    _id: "multiday",
    date: local(2026, 5, 1),
    checkIn: { time: local(2026, 5, 1, 13, 21) },
    // Two days later — the real 04 Aug record spanned 49 hours.
    checkOut: { time: local(2026, 5, 3, 14, 45) },
    connectivityGaps: [],
  };

  it("the summary reports the clamped day portion, not the 49-hour span", () => {
    const { shiftMs } = computeAttendanceDurations(RECORD, NOW);

    // 13:21 to midnight = 10h39m. The old code returned the raw span.
    expect(formatDuration(shiftMs)).toBe("10h 39m");
    expect(formatDuration(shiftMs)).not.toBe("49h 24m");
  });

  it("the bar's green band and the Shift label describe the same window", () => {
    const bar = greenSpan(RECORD, NOW);

    expect(bar.width).toBeCloseTo(summaryWidthPercent(RECORD, NOW), 6);
    // Runs to the end of the bar.
    expect(bar.left + bar.width).toBeCloseTo(100, 6);
  });
});

/**
 * The other contradiction: the bar drew a green band from check-in while all
 * three labels read "-". Hits every real in-progress shift.
 */
describe("An in-progress shift — elapsed so far, in both", () => {
  const CHECK_IN = local(2026, 5, 1, 9);
  const NOW = local(2026, 5, 1, 14, 30).getTime();
  const RECORD = {
    _id: "open",
    date: local(2026, 5, 1),
    checkIn: { time: CHECK_IN },
    checkOut: { time: null },
    connectivityGaps: [],
  };

  it("reports elapsed time rather than '-'", () => {
    const { shiftMs, isOpen } = computeAttendanceDurations(RECORD, NOW);

    expect(isOpen).toBe(true);
    expect(formatDuration(shiftMs)).toBe("5h 30m");
    expect(formatDuration(shiftMs)).not.toBe("-");
  });

  it("the bar stops at NOW too, not at midnight", () => {
    const bar = greenSpan(RECORD, NOW);

    // Claiming tracked time up to midnight for a shift that started five
    // hours ago would assert time that has not happened.
    expect(bar.endMs).toBe(NOW);
    expect(bar.width).toBeCloseTo(summaryWidthPercent(RECORD, NOW), 6);
  });

  it("an open shift on a PAST day still clamps to that day's end", () => {
    const laterNow = local(2026, 5, 5, 10).getTime();
    const bar = greenSpan(RECORD, laterNow);

    expect(bar.left + bar.width).toBeCloseTo(100, 6);
    expect(bar.width).toBeCloseTo(summaryWidthPercent(RECORD, laterNow), 6);
  });

  it("still reports nothing measurable when there is no check-in at all", () => {
    const absent = { _id: "absent", date: local(2026, 5, 1), checkIn: { time: null }, connectivityGaps: [] };
    const { shiftMs } = computeAttendanceDurations(absent, NOW);

    expect(shiftMs).toBeNull();
    expect(formatDuration(shiftMs)).toBe("-");
    expect(computeTimelineSegments(absent, NOW)).toEqual([]);
  });
});

describe("Sub-perceptible bands are not drawn", () => {
  const NOW = local(2026, 5, 1, 20).getTime();

  const withBreak = (seconds) => ({
    _id: "break",
    date: local(2026, 5, 1),
    checkIn: { time: local(2026, 5, 1, 9) },
    checkOut: { time: local(2026, 5, 1, 17) },
    breakIn: { time: local(2026, 5, 1, 13) },
    breakOut: { time: new Date(local(2026, 5, 1, 13).getTime() + seconds * 1000) },
    connectivityGaps: [],
  });

  it("renders NO amber band for a break of a few seconds", () => {
    // Two real records have breakIn/breakOut seconds apart, producing a
    // 0.004%-wide sliver that cannot be seen or hovered.
    const segments = computeTimelineSegments(withBreak(8), NOW);

    expect(segments.filter((s) => s.color === "amber")).toHaveLength(0);
  });

  it("still renders a real break", () => {
    const segments = computeTimelineSegments(withBreak(60 * 60), NOW);

    expect(segments.filter((s) => s.color === "amber")).toHaveLength(1);
  });

  it("applies the same floor to connectivity gaps", () => {
    const record = {
      _id: "gap",
      date: local(2026, 5, 1),
      checkIn: { time: local(2026, 5, 1, 9) },
      checkOut: { time: local(2026, 5, 1, 17) },
      connectivityGaps: [
        { start: local(2026, 5, 1, 10), end: new Date(local(2026, 5, 1, 10).getTime() + 5000) },
        { start: local(2026, 5, 1, 11), end: local(2026, 5, 1, 11, 30) },
      ],
    };

    expect(computeTimelineSegments(record, NOW).filter((s) => s.color === "red")).toHaveLength(1);
  });

  it("draws a band exactly at the threshold", () => {
    const segments = computeTimelineSegments(withBreak(MIN_SEGMENT_MS / 1000), NOW);

    expect(segments.filter((s) => s.color === "amber")).toHaveLength(1);
  });
});

describe("Connected + Not Tracked never exceed the day's Shift total", () => {
  const NOW = local(2026, 5, 3, 12).getTime();

  it("holds for a shift crossing midnight, where gaps are also clamped", () => {
    const record = {
      _id: "multiday-gaps",
      date: local(2026, 5, 1),
      checkIn: { time: local(2026, 5, 1, 13) },
      checkOut: { time: local(2026, 5, 3, 14) },
      connectivityGaps: [
        { start: local(2026, 5, 1, 14), end: local(2026, 5, 1, 15) },
        // Entirely on a later day — must not count toward THIS day.
        { start: local(2026, 5, 2, 10), end: local(2026, 5, 2, 12) },
      ],
    };

    const { shiftMs, connectedMs, issueMs } = computeAttendanceDurations(record, NOW);

    expect(connectedMs + issueMs).toBeLessThanOrEqual(shiftMs);
    expect(formatDuration(issueMs)).toBe("1h 0m");
  });
});
