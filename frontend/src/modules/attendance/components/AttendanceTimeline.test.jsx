import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AttendanceTimeline from "./AttendanceTimeline";

const DAY_WITH_GAP = {
  _id: "att-gap",
  date: "2026-06-01T00:00:00.000Z",
  checkIn: { time: "2026-06-01T09:00:00.000Z" },
  checkOut: { time: "2026-06-01T17:00:00.000Z" },
  workingHours: 7.5,
  connectivityGaps: [{ start: "2026-06-01T12:00:00.000Z", end: "2026-06-01T12:30:00.000Z" }],
  status: "present",
};

const DAY_WITHOUT_GAP = {
  _id: "att-no-gap",
  date: "2026-06-02T00:00:00.000Z",
  checkIn: { time: "2026-06-02T09:00:00.000Z" },
  checkOut: { time: "2026-06-02T17:00:00.000Z" },
  workingHours: 8,
  connectivityGaps: [],
  status: "present",
};

const DAY_MANUALLY_ADJUSTED = {
  _id: "att-manual",
  date: "2026-06-03T00:00:00.000Z",
  checkIn: { time: null },
  checkOut: { time: null },
  workingHours: null,
  connectivityGaps: [],
  status: "on_leave",
  isManuallyAdjusted: true,
};

const DAY_WITH_GEOFENCE_VIOLATION = {
  _id: "att-geofence",
  date: "2026-06-04T00:00:00.000Z",
  checkIn: { time: "2026-06-04T09:00:00.000Z" },
  checkOut: { time: "2026-06-04T17:00:00.000Z" },
  workingHours: 8,
  connectivityGaps: [],
  geofenceViolations: [
    { start: "2026-06-04T12:00:00.000Z", end: "2026-06-04T12:30:00.000Z", maxDistanceMeters: 850 },
  ],
  status: "present",
};

describe("AttendanceTimeline", () => {
  it("renders one row per record with working hours", () => {
    render(<AttendanceTimeline records={[DAY_WITH_GAP, DAY_WITHOUT_GAP]} isLoading={false} />);

    expect(screen.getByText("7.50h")).toBeInTheDocument();
    expect(screen.getByText("8.00h")).toBeInTheDocument();
  });

  it("renders a connectivity gap as a visually distinct segment (real class/style, not just data presence)", () => {
    render(<AttendanceTimeline records={[DAY_WITH_GAP]} isLoading={false} />);

    const gapSegment = screen.getByTestId("connectivity-gap-segment");
    expect(gapSegment).toHaveClass("bg-red-500");
    // The segment must actually be positioned within the shift (not 0-width
    // or full-width by accident) — the gap is 30 minutes within an 8-hour
    // shift starting at 09:00, so it should sit partway across, not at 0%.
    expect(gapSegment.style.left).not.toBe("0%");
  });

  it("renders a plain green bar with no red segment when there are no gaps", () => {
    render(<AttendanceTimeline records={[DAY_WITHOUT_GAP]} isLoading={false} />);

    expect(screen.queryByTestId("connectivity-gap-segment")).not.toBeInTheDocument();
    expect(screen.getByTestId("connectivity-gap-bar")).toHaveClass("bg-green-400");
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
    expect(screen.queryByTestId("connectivity-gap-segment")).not.toBeInTheDocument();
  });

  it("renders a plain green bar with no orange segment when there are no geofence violations", () => {
    render(<AttendanceTimeline records={[DAY_WITHOUT_GAP]} isLoading={false} />);

    expect(screen.queryByTestId("geofence-violation-segment")).not.toBeInTheDocument();
    expect(screen.getByTestId("geofence-violation-bar")).toHaveClass("bg-green-400");
  });

  it("adds a per-row Edit action only when onEditRecord is provided, and it stops row-click propagation", async () => {
    const onRowClick = vi.fn();
    const onEditRecord = vi.fn();
    render(
      <AttendanceTimeline
        records={[DAY_WITHOUT_GAP]}
        isLoading={false}
        onRowClick={onRowClick}
        onEditRecord={onEditRecord}
      />
    );

    await userEvent.click(screen.getByRole("button"));

    expect(onEditRecord).toHaveBeenCalledWith(DAY_WITHOUT_GAP);
    expect(onRowClick).not.toHaveBeenCalled();
  });
});
