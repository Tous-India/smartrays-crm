import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import AttendanceTimeline from "./AttendanceTimeline";

// Local-time constructors (not UTC ISO strings) — the timeline bar derives
// its day boundaries from `record.date` in local time, same reasoning as
// `attendanceTimeline.test.js`'s own fixtures.
function localDate(hour, minute = 0, dayOffset = 0) {
  return new Date(2026, 5, 1 + dayOffset, hour, minute, 0, 0);
}

const DAY_WITH_GAP = {
  _id: "att-gap",
  date: localDate(0),
  checkIn: { time: localDate(9) },
  checkOut: { time: localDate(17) },
  workingHours: 7.5,
  connectivityGaps: [{ start: localDate(12), end: localDate(12, 30) }],
  status: "present",
};

const DAY_WITHOUT_GAP = {
  _id: "att-no-gap",
  date: localDate(0, 0, 1),
  checkIn: { time: localDate(9, 0, 1) },
  checkOut: { time: localDate(17, 0, 1) },
  workingHours: 8,
  connectivityGaps: [],
  status: "present",
};

const DAY_MANUALLY_ADJUSTED = {
  _id: "att-manual",
  date: localDate(0, 0, 2),
  checkIn: { time: null },
  checkOut: { time: null },
  workingHours: null,
  connectivityGaps: [],
  status: "on_leave",
  isManuallyAdjusted: true,
};

const DAY_WITH_GEOFENCE_VIOLATION = {
  _id: "att-geofence",
  date: localDate(0, 0, 3),
  checkIn: { time: localDate(9, 0, 3) },
  checkOut: { time: localDate(17, 0, 3) },
  workingHours: 8,
  connectivityGaps: [],
  geofenceViolations: [{ start: localDate(12, 0, 3), end: localDate(12, 30, 3), maxDistanceMeters: 850 }],
  status: "present",
};

describe("AttendanceTimeline", () => {
  it("renders the calculated duration stats for each record's timeline", () => {
    render(<AttendanceTimeline records={[DAY_WITH_GAP, DAY_WITHOUT_GAP]} isLoading={false} />);

    // DAY_WITH_GAP: 8h shift - 30m gap = 7h 30m connected, 30m issues.
    // (DAY_WITHOUT_GAP is also an 8h shift, so "Shift: 8h 0m" appears twice.)
    expect(screen.getAllByText("Shift: 8h 0m")).toHaveLength(2);
    expect(screen.getByText("Connected: 7h 30m")).toBeInTheDocument();
    expect(screen.getByText("Not Tracked: 30m")).toBeInTheDocument();
    // DAY_WITHOUT_GAP: full 8h shift, no issues.
    expect(screen.getByText("Connected: 8h 0m")).toBeInTheDocument();
    expect(screen.getByText("Not Tracked: 0m")).toBeInTheDocument();
  });

  it("renders a connectivity gap as a visually distinct red segment (real class/style, not just data presence)", () => {
    render(<AttendanceTimeline records={[DAY_WITH_GAP]} isLoading={false} />);

    const gapSegment = screen.getByTestId("attendance-timeline-segment-red");
    expect(gapSegment).toHaveClass("bg-red-500");
    // The segment must actually be positioned within the shift (not 0-width
    // or full-width by accident) — the gap is 30 minutes within an 8-hour
    // shift starting at 09:00, so it should sit partway across, not at 0%.
    expect(gapSegment.style.left).not.toBe("0%");
  });

  it("renders only a green segment (no red) when there are no gaps", () => {
    render(<AttendanceTimeline records={[DAY_WITHOUT_GAP]} isLoading={false} />);

    expect(screen.queryByTestId("attendance-timeline-segment-red")).not.toBeInTheDocument();
    expect(screen.getByTestId("attendance-timeline-segment-green")).toBeInTheDocument();
  });

  it("renders a fully gray bar (no segments at all) for a day with no attendance", () => {
    render(<AttendanceTimeline records={[DAY_MANUALLY_ADJUSTED]} isLoading={false} />);

    expect(screen.queryByTestId("attendance-timeline-segment-green")).not.toBeInTheDocument();
    expect(screen.queryByTestId("attendance-timeline-segment-red")).not.toBeInTheDocument();
    expect(screen.getByTestId("attendance-timeline-bar")).toBeInTheDocument();
  });

  it("shows a manually-adjusted marker next to the Status tag for an admin-corrected record, and not for a real check-in", () => {
    render(<AttendanceTimeline records={[DAY_WITHOUT_GAP, DAY_MANUALLY_ADJUSTED]} isLoading={false} />);

    expect(screen.getByTestId(`manual-marker-${DAY_MANUALLY_ADJUSTED._id}`)).toBeInTheDocument();
    expect(screen.queryByTestId(`manual-marker-${DAY_WITHOUT_GAP._id}`)).not.toBeInTheDocument();
  });

  it("renders a geofence violation as a visually distinct orange segment, not the same color as a connectivity gap", () => {
    render(<AttendanceTimeline records={[DAY_WITH_GEOFENCE_VIOLATION]} isLoading={false} />);

    const violationSegment = screen.getByTestId("geofence-violation-segment");
    expect(violationSegment).toHaveClass("bg-orange-500");
    expect(violationSegment).not.toHaveClass("bg-red-500");
    expect(violationSegment.style.left).not.toBe("0%");
    // No connectivity gap on this record — the two bars must be independent,
    // not the same underlying data driving both columns.
    expect(screen.queryByTestId("attendance-timeline-segment-red")).not.toBeInTheDocument();
  });

  it("renders a plain green bar with no orange segment when there are no geofence violations", () => {
    render(<AttendanceTimeline records={[DAY_WITHOUT_GAP]} isLoading={false} />);

    expect(screen.queryByTestId("geofence-violation-segment")).not.toBeInTheDocument();
    expect(screen.getByTestId("geofence-violation-bar")).toHaveClass("bg-green-400");
  });

  it("never renders a per-row Edit action (Attendance is UI-read-only)", () => {
    render(<AttendanceTimeline records={[DAY_WITHOUT_GAP]} isLoading={false} onRowClick={vi.fn()} />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
