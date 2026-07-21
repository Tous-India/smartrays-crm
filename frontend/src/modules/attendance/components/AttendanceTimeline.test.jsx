import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
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
});
