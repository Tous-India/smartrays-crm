import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ConnectivityGapBar from "./ConnectivityGapBar";
import AttendanceTimelineBar from "./AttendanceTimelineBar";

/**
 * §7.4h (2026-08-06) — `ConnectivityGapBar` was the last bar still using its
 * own check-in→check-out scaling, a green full-width base, and native
 * `title` attributes.
 *
 * AntD's `Tooltip` is replaced with a passthrough that WRAPS rather than
 * clones, so the trigger is countable and its title readable — the real
 * component clones its child, leaving nothing to assert on.
 */
vi.mock("antd", async (importOriginal) => {
  const actual = await importOriginal();

  function CountableTooltip({ title, children }) {
    return (
      <span data-tooltip-trigger="true" data-tooltip-title={typeof title === "string" ? title : ""}>
        {children}
      </span>
    );
  }

  return { ...actual, Tooltip: CountableTooltip };
});

function localDate(hour, minute = 0) {
  return new Date(2026, 5, 1, hour, minute, 0, 0);
}

const RECORD = {
  _id: "att-1",
  date: localDate(0),
  checkIn: { time: localDate(9) },
  checkOut: { time: localDate(18) },
  breakIn: { time: localDate(13) },
  breakOut: { time: localDate(14) },
  connectivityGaps: [{ start: localDate(10, 30), end: localDate(11) }],
  status: "present",
};

const OPEN_SHIFT = { ...RECORD, _id: "att-open", checkOut: { time: null }, connectivityGaps: [] };
const NO_CHECK_IN = {
  _id: "att-none",
  date: localDate(0),
  checkIn: { time: null },
  checkOut: { time: null },
  connectivityGaps: [],
};

const BASE = "Not tracked — outside the checked-in period for this day";

const bar = () => screen.getByTestId("connectivity-gap-bar");
const trigger = () => bar().closest("[data-tooltip-trigger]");

describe("ConnectivityGapBar — shared axis", () => {
  /**
   * The assertion that matters: the SAME clock time must land at the SAME
   * offset here as in the Timeline column. Previously this bar stretched
   * check-in→check-out across its whole width, so a 10:30 gap sat at 16.7%
   * here and 43.75% there.
   */
  it("places a gap at the SAME left/width as the Timeline column", () => {
    const { unmount } = render(<ConnectivityGapBar record={RECORD} />);
    const here = screen.getByTestId("connectivity-gap-segment").style;
    const gap = { left: here.left, width: here.width };
    unmount();

    render(<AttendanceTimelineBar record={RECORD} />);
    const there = screen.getByTestId("attendance-timeline-segment-red").style;

    expect(gap.left).toBe(there.left);
    expect(gap.width).toBe(there.width);
    // 10:30 of a 24-hour day.
    expect(gap.left).toBe("43.75%");
  });

  it("places the connected band at the same offset as the Timeline column", () => {
    const { unmount } = render(<ConnectivityGapBar record={RECORD} />);
    const here = screen.getByTestId("connectivity-connected-segment").style;
    const connected = { left: here.left, width: here.width };
    unmount();

    render(<AttendanceTimelineBar record={RECORD} />);
    const there = screen.getByTestId("attendance-timeline-segment-green").style;

    expect(connected.left).toBe(there.left);
    expect(connected.width).toBe(there.width);
    expect(connected.left).toBe("37.5%");
  });

  it("leaves the off-shift hours GRAY, never green", () => {
    render(<ConnectivityGapBar record={RECORD} />);

    // A green base covered the full width, asserting "connected" for hours
    // nobody was working — the same false claim the Location bar made.
    expect(bar()).toHaveClass("bg-gray-200");
    expect(bar().className).not.toMatch(/bg-green/);

    const connected = screen.getByTestId("connectivity-connected-segment");
    expect(parseFloat(connected.style.left)).toBeGreaterThan(0);
    expect(parseFloat(connected.style.left) + parseFloat(connected.style.width)).toBeLessThan(100);
  });

  it("renders a bar for an OPEN shift instead of bailing to text", () => {
    render(<ConnectivityGapBar record={OPEN_SHIFT} />);

    expect(screen.queryByText("Shift in progress")).not.toBeInTheDocument();
    expect(bar()).toBeInTheDocument();
    // 09:00 to end of day, exactly as the timeline draws it.
    expect(screen.getByTestId("connectivity-connected-segment").style.width).toBe("62.5%");
  });

  it("renders a bare gray bar when there is no check-in", () => {
    render(<ConnectivityGapBar record={NO_CHECK_IN} />);

    expect(bar().children).toHaveLength(0);
    expect(bar()).toHaveClass("bg-gray-200");
  });

  it("omits the break band — this section is about connectivity", () => {
    render(<ConnectivityGapBar record={RECORD} />);

    expect(bar().querySelectorAll(".bg-amber-400")).toHaveLength(0);
  });
});

describe("ConnectivityGapBar — palette", () => {
  it("uses the Timeline's own gap colour, so a gap looks the same everywhere", () => {
    render(<ConnectivityGapBar record={RECORD} />);

    expect(screen.getByTestId("connectivity-gap-segment")).toHaveClass("bg-red-500");
  });

  it("stays out of the sky/violet geofence family entirely", () => {
    render(<ConnectivityGapBar record={RECORD} />);

    // Keeping connectivity and geofence visually separate is the point of
    // that earlier palette split.
    expect(bar().innerHTML).not.toMatch(/bg-(sky|violet)/);
  });
});

describe("ConnectivityGapBar — one controlled tooltip", () => {
  it("uses no native title attribute anywhere", () => {
    render(<ConnectivityGapBar record={RECORD} />);

    expect(bar()).not.toHaveAttribute("title");
    bar().querySelectorAll("div").forEach((segment) => {
      expect(segment).not.toHaveAttribute("title");
    });
  });

  it("puts exactly one tooltip trigger around the bar, none inside it", () => {
    render(<ConnectivityGapBar record={RECORD} />);

    expect(bar().querySelectorAll("[data-tooltip-trigger]")).toHaveLength(0);
    expect(document.querySelectorAll("[data-tooltip-trigger]")).toHaveLength(1);
  });

  it("swaps content to the hovered band and back to the base", () => {
    render(<ConnectivityGapBar record={RECORD} />);

    expect(trigger()).toHaveAttribute("data-tooltip-title", BASE);

    const gap = screen.getByTestId("connectivity-gap-segment");
    fireEvent.mouseEnter(gap);
    expect(trigger().getAttribute("data-tooltip-title")).toBe(
      "Connectivity issue — no tracking signal received · 10:30 AM – 11:00 AM"
    );

    fireEvent.mouseLeave(gap);
    expect(trigger()).toHaveAttribute("data-tooltip-title", BASE);
  });

  it("keeps the incoming band when moving between bands", () => {
    render(<ConnectivityGapBar record={RECORD} />);
    const connected = screen.getByTestId("connectivity-connected-segment");
    const gap = screen.getByTestId("connectivity-gap-segment");

    fireEvent.mouseEnter(connected);
    fireEvent.mouseLeave(connected);
    fireEvent.mouseEnter(gap);

    expect(trigger().getAttribute("data-tooltip-title")).toMatch(/Connectivity issue/);
  });
});
