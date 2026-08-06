import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import GeofenceViolationBar from "./GeofenceViolationBar";

/**
 * §7.4f (2026-08-06) — the Location column joins the timeline's
 * one-controlled-Tooltip pattern.
 *
 * It previously used native `title` attributes. A browser-native tooltip and
 * an AntD tooltip from the neighbouring column can be on screen at the same
 * moment, which is the same two-tooltips-at-once symptom the timeline was
 * fixed for, arriving by a different route.
 *
 * As in `AttendanceTimelineBar.tooltip.test.jsx`, AntD's `Tooltip` is
 * replaced by a passthrough that WRAPS rather than clones, so triggers are
 * countable — the real component clones its child and would leave nothing to
 * assert on.
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

const WITH_VIOLATION = {
  _id: "att-v",
  date: localDate(0),
  checkIn: { time: localDate(9) },
  checkOut: { time: localDate(18) },
  connectivityGaps: [],
  geofenceViolations: [{ start: localDate(10, 30), end: localDate(11), maxDistanceMeters: 250.4 }],
  status: "present",
};

const CLEAN_DAY = { ...WITH_VIOLATION, _id: "att-clean", geofenceViolations: [] };

const OPEN_SHIFT = {
  ...WITH_VIOLATION,
  _id: "att-open",
  checkOut: { time: null },
  geofenceViolations: [{ start: localDate(15), end: null, maxDistanceMeters: 800 }],
};

const BASE_TITLE = "Off shift — no location tracking outside the checked-in period";

function bar() {
  return screen.getByTestId("geofence-violation-bar");
}

function trigger() {
  return bar().closest("[data-tooltip-trigger]");
}

describe("GeofenceViolationBar — palette and base", () => {
  it("uses a NEUTRAL GRAY base, never green, for the off-shift hours", () => {
    render(<GeofenceViolationBar record={CLEAN_DAY} />);

    // Green here meant "inside the geofence" and covered the whole day,
    // including the entire night nobody was working.
    expect(bar()).toHaveClass("bg-gray-200");
    expect(bar().className).not.toMatch(/bg-green/);
  });

  it("gives Location its own colour family, distinct from Timeline's", () => {
    render(<GeofenceViolationBar record={WITH_VIOLATION} />);

    const inside = screen.getByTestId("geofence-inside-segment");
    const violation = screen.getByTestId("geofence-violation-segment");

    // Sky/violet, not the timeline's green/amber/red — and specifically not
    // an orange sitting a shade away from the timeline's red.
    expect(inside).toHaveClass("bg-sky-300");
    expect(violation).toHaveClass("bg-violet-600");
    expect(violation.className).not.toMatch(/bg-(orange|red)/);
  });

  it("still renders a bar for an open shift rather than bailing to text", () => {
    render(<GeofenceViolationBar record={OPEN_SHIFT} />);

    // It used to early-return "Shift in progress" as plain text, so the
    // column lost its axis entirely on an in-progress shift.
    expect(bar()).toBeInTheDocument();
    expect(screen.queryByText("Shift in progress")).not.toBeInTheDocument();
    expect(screen.getByTestId("geofence-inside-segment")).toBeInTheDocument();
  });

  it("renders a bare gray bar with no segments when there is no check-in", () => {
    render(
      <GeofenceViolationBar
        record={{ _id: "n", date: localDate(0), checkIn: { time: null }, geofenceViolations: [] }}
      />
    );

    expect(bar().children).toHaveLength(0);
    expect(trigger()).toHaveAttribute("data-tooltip-title", BASE_TITLE);
  });
});

describe("GeofenceViolationBar — one controlled tooltip", () => {
  it("puts NO tooltip trigger inside the bar and uses no native title", () => {
    render(<GeofenceViolationBar record={WITH_VIOLATION} />);

    expect(bar().querySelectorAll("[data-tooltip-trigger]")).toHaveLength(0);
    expect(trigger()).not.toBeNull();

    // A native `title` renders a browser tooltip that can appear ALONGSIDE
    // the AntD one from the Timeline column.
    expect(bar()).not.toHaveAttribute("title");
    bar().querySelectorAll("div").forEach((segment) => {
      expect(segment).not.toHaveAttribute("title");
    });
  });

  it("explains the gray region when nothing is hovered", () => {
    render(<GeofenceViolationBar record={WITH_VIOLATION} />);

    expect(trigger()).toHaveAttribute("data-tooltip-title", BASE_TITLE);
  });

  it("states the clock range for time inside the geofence", () => {
    render(<GeofenceViolationBar record={WITH_VIOLATION} />);

    fireEvent.mouseEnter(screen.getByTestId("geofence-inside-segment"));

    expect(trigger()).toHaveAttribute(
      "data-tooltip-title",
      "Within the geofence · 9:00 AM – 6:00 PM"
    );
  });

  it("states the distance AND the clock range for a violation", () => {
    render(<GeofenceViolationBar record={WITH_VIOLATION} />);

    fireEvent.mouseEnter(screen.getByTestId("geofence-violation-segment"));

    expect(trigger()).toHaveAttribute(
      "data-tooltip-title",
      "Outside the geofence · 10:30 AM – 11:00 AM · up to 250 m from check-in"
    );
  });

  it("returns to the gray explanation when the cursor leaves a band", () => {
    render(<GeofenceViolationBar record={WITH_VIOLATION} />);
    const violation = screen.getByTestId("geofence-violation-segment");

    fireEvent.mouseEnter(violation);
    expect(trigger()).not.toHaveAttribute("data-tooltip-title", BASE_TITLE);

    fireEvent.mouseLeave(violation);
    expect(trigger()).toHaveAttribute("data-tooltip-title", BASE_TITLE);
  });

  it("keeps the incoming band when moving straight from one band to another", () => {
    render(<GeofenceViolationBar record={WITH_VIOLATION} />);
    const inside = screen.getByTestId("geofence-inside-segment");
    const violation = screen.getByTestId("geofence-violation-segment");

    fireEvent.mouseEnter(inside);
    fireEvent.mouseLeave(inside);
    fireEvent.mouseEnter(violation);

    expect(trigger()).toHaveAttribute(
      "data-tooltip-title",
      "Outside the geofence · 10:30 AM – 11:00 AM · up to 250 m from check-in"
    );
  });
});
