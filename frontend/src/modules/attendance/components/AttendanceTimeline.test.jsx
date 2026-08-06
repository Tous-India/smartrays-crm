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

  // §7.4g (2026-08-06) — the Location column is a Geofence CHIP now, not a
  // bar. Two bars of equal width in one row measuring unrelated things read
  // as comparable; a chip reads as a value. Chip behaviour itself is covered
  // in GeofenceChip.test.jsx; these assert the column's wiring.
  it("renders the Geofence column as a chip, with no bar to diff against the Timeline", () => {
    render(<AttendanceTimeline records={[DAY_WITH_GEOFENCE_VIOLATION]} isLoading={false} />);

    expect(screen.getByTestId("geofence-chip")).toHaveTextContent("1 excursion · max 850 m");
    expect(screen.queryByTestId("geofence-violation-bar")).not.toBeInTheDocument();
    expect(screen.queryByTestId("geofence-violation-segment")).not.toBeInTheDocument();
    // The Timeline bar is still a bar — only the Location column changed.
    expect(screen.getByTestId("attendance-timeline-bar")).toBeInTheDocument();
  });

  it("names the column Geofence, not Location", () => {
    render(<AttendanceTimeline records={[DAY_WITHOUT_GAP]} isLoading={false} />);

    // getAllBy* because `scroll={{ x: "max-content" }}` makes AntD render a
    // second measurement header row.
    // "Location" reads as "where were they", which is the Live Map's job.
    expect(screen.getAllByText("Geofence").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("Location")).toHaveLength(0);
  });

  it("shows a clean shift as 'Within range'", () => {
    render(<AttendanceTimeline records={[DAY_WITHOUT_GAP]} isLoading={false} />);

    expect(screen.getByTestId("geofence-chip")).toHaveTextContent("Within range");
  });

  it("never renders a per-row Edit action (Attendance is UI-read-only)", () => {
    render(<AttendanceTimeline records={[DAY_WITHOUT_GAP]} isLoading={false} onRowClick={vi.fn()} />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
