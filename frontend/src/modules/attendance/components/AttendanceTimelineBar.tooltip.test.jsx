import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import AttendanceTimelineBar from "./AttendanceTimelineBar";

/**
 * Regression guard (2026-08-06): the bar used to carry a Tooltip AND give
 * every segment its own. Because the bar is an ANCESTOR of the segments, its
 * mouseenter fired by bubbling on every hover and TWO tooltips opened at
 * once — reproduced in a real browser on every coloured band, not merely at
 * segment boundaries.
 *
 * jsdom has no meaningful hover or pointer semantics, and AntD's real
 * `Tooltip` clones its child rather than wrapping it, so asserting on the
 * rendered DOM cannot tell the two implementations apart — a first attempt at
 * this test passed against the *buggy* component and was thrown away.
 *
 * So `Tooltip` is replaced here with a passthrough that DOES wrap, making
 * every tooltip trigger countable. That distinguishes the two shapes exactly:
 * the old component put a trigger inside the bar for each segment, the fixed
 * one puts exactly one around the whole bar and swaps its title.
 *
 * The end-to-end proof (one tooltip visible at every band, every boundary,
 * and during a fast sweep) is the browser run written up in
 * frontend/README.md — this file guards the structure that causes it.
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

// One record carrying all four band types: gray base, green work, amber
// break, red gaps.
const FULL_DAY = {
  _id: "att-full",
  date: localDate(0),
  checkIn: { time: localDate(9) },
  checkOut: { time: localDate(18) },
  breakIn: { time: localDate(13) },
  breakOut: { time: localDate(14) },
  connectivityGaps: [
    { start: localDate(10, 30), end: localDate(11) },
    { start: localDate(16), end: localDate(16, 45) },
  ],
  status: "present",
};

const BASE_TITLE = "Not tracked — outside the checked-in period for this day";

function barTrigger() {
  return screen.getByTestId("attendance-timeline-bar").closest("[data-tooltip-trigger]");
}

describe("AttendanceTimelineBar — exactly one tooltip", () => {
  it("puts NO tooltip trigger inside the bar — one for the whole bar instead", () => {
    render(<AttendanceTimelineBar record={FULL_DAY} />);

    const bar = screen.getByTestId("attendance-timeline-bar");

    // The old shape had one trigger per segment nested inside the bar; each
    // of those is a second tooltip that opens alongside the bar's own.
    expect(bar.querySelectorAll("[data-tooltip-trigger]")).toHaveLength(0);
    expect(barTrigger()).not.toBeNull();
  });

  it("renders all four band types, so this is a genuine full-coverage row", () => {
    render(<AttendanceTimelineBar record={FULL_DAY} />);

    expect(screen.getByTestId("attendance-timeline-segment-green")).toBeInTheDocument();
    expect(screen.getByTestId("attendance-timeline-segment-amber")).toBeInTheDocument();
    expect(screen.getAllByTestId("attendance-timeline-segment-red")).toHaveLength(2);
    expect(screen.getByTestId("attendance-timeline-bar")).toHaveClass("bg-gray-200");
  });

  it("shows the GRAY base explanation when nothing is hovered", () => {
    render(<AttendanceTimelineBar record={FULL_DAY} />);

    expect(barTrigger()).toHaveAttribute("data-tooltip-title", BASE_TITLE);
  });

  it.each([
    ["green", "Connected — checked in and tracking normally · 9:00 AM – 6:00 PM"],
    ["amber", "On break · 1:00 PM – 2:00 PM"],
  ])("swaps the single tooltip's content to the hovered %s band", (color, expected) => {
    render(<AttendanceTimelineBar record={FULL_DAY} />);

    fireEvent.mouseEnter(screen.getByTestId(`attendance-timeline-segment-${color}`));

    expect(barTrigger()).toHaveAttribute("data-tooltip-title", expected);
    // Still exactly one trigger — the content changed, not the count.
    expect(screen.getByTestId("attendance-timeline-bar").querySelectorAll("[data-tooltip-trigger]"))
      .toHaveLength(0);
  });

  it("shows a red gap's own clock range, not the shift's", () => {
    render(<AttendanceTimelineBar record={FULL_DAY} />);

    fireEvent.mouseEnter(screen.getAllByTestId("attendance-timeline-segment-red")[0]);

    expect(barTrigger()).toHaveAttribute(
      "data-tooltip-title",
      "Connectivity issue — no tracking signal received · 10:30 AM – 11:00 AM"
    );
  });

  it("returns to the base explanation when the cursor leaves a band", () => {
    render(<AttendanceTimelineBar record={FULL_DAY} />);
    const amber = screen.getByTestId("attendance-timeline-segment-amber");

    fireEvent.mouseEnter(amber);
    expect(barTrigger()).toHaveAttribute("data-tooltip-title", "On break · 1:00 PM – 2:00 PM");

    fireEvent.mouseLeave(amber);
    expect(barTrigger()).toHaveAttribute("data-tooltip-title", BASE_TITLE);
  });

  it("keeps the incoming band when moving straight from one band to another", () => {
    render(<AttendanceTimelineBar record={FULL_DAY} />);
    const green = screen.getByTestId("attendance-timeline-segment-green");
    const amber = screen.getByTestId("attendance-timeline-segment-amber");

    fireEvent.mouseEnter(green);
    // The DOM fires the outgoing element's mouseleave BEFORE the incoming
    // element's mouseenter — the stale reset must not win.
    fireEvent.mouseLeave(green);
    fireEvent.mouseEnter(amber);

    expect(barTrigger()).toHaveAttribute("data-tooltip-title", "On break · 1:00 PM – 2:00 PM");
  });

  it("renders a bare gray bar with no segments when there is no check-in", () => {
    render(<AttendanceTimelineBar record={{ _id: "none", date: localDate(0), connectivityGaps: [] }} />);

    expect(screen.getByTestId("attendance-timeline-bar").children).toHaveLength(0);
    expect(barTrigger()).toHaveAttribute("data-tooltip-title", BASE_TITLE);
  });
});
