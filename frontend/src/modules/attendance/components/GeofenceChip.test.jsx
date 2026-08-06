import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import GeofenceViolationBar from "./GeofenceViolationBar";

/**
 * §7.4g (2026-08-06) — the Location column became a Geofence status CHIP.
 *
 * As in the timeline's own tooltip test, AntD's `Tooltip` is replaced with a
 * passthrough that WRAPS rather than clones, so the trigger is countable and
 * its title readable. The real component clones its child, leaving nothing to
 * assert against.
 */
vi.mock("antd", async (importOriginal) => {
  const actual = await importOriginal();

  function CountableTooltip({ title, children }) {
    return (
      <span data-tooltip-trigger="true">
        {/* Rendered rather than serialised — a tooltip title can be an
            element tree (the multi-violation list), and JSON.stringify on a
            React element hits a circular structure. */}
        <span data-tooltip-content="true">{title}</span>
        {children}
      </span>
    );
  }

  return { ...actual, Tooltip: CountableTooltip };
});

function localDate(hour, minute = 0) {
  return new Date(2026, 5, 1, hour, minute, 0, 0);
}

const COORDS = { lat: 19.076, lng: 72.877 };

const base = (overrides = {}) => ({
  _id: "att-1",
  employeeId: "emp-1",
  date: localDate(0),
  checkIn: { time: localDate(9), coords: COORDS },
  checkOut: { time: localDate(18) },
  geofenceViolations: [],
  ...overrides,
});

const chip = () => screen.getByTestId("geofence-chip");
const trigger = () => screen.getByTestId("geofence-chip-wrapper").closest("[data-tooltip-trigger]");
/** The tooltip's text, whether its title was a string or an element tree. */
const tooltipText = () => trigger().querySelector("[data-tooltip-content]").textContent;

describe("Geofence chip — replaces the bar entirely", () => {
  it("renders NO bar element at all", () => {
    render(<GeofenceViolationBar record={base()} />);

    // The whole point: nothing here can be visually diffed against the
    // Timeline bar in the neighbouring column.
    expect(screen.queryByTestId("geofence-violation-bar")).not.toBeInTheDocument();
    expect(screen.queryByTestId("geofence-violation-segment")).not.toBeInTheDocument();
    expect(screen.queryByTestId("geofence-inside-segment")).not.toBeInTheDocument();
    expect(chip()).toBeInTheDocument();
  });

  it("uses no native title attribute anywhere", () => {
    render(<GeofenceViolationBar record={base()} />);

    // A native title renders a browser tooltip that can be on screen at the
    // same moment as the Timeline column's AntD one.
    expect(chip()).not.toHaveAttribute("title");
    expect(screen.getByTestId("geofence-chip-wrapper")).not.toHaveAttribute("title");
  });
});

describe("Geofence chip — the four states", () => {
  it("shows 'Within range' for a clean finished shift", () => {
    render(<GeofenceViolationBar record={base()} />);

    expect(chip()).toHaveTextContent("Within range");
    expect(chip()).toHaveAttribute("data-state", "within_range");
  });

  it("shows 'In progress' for an open shift", () => {
    render(<GeofenceViolationBar record={base({ checkOut: { time: null } })} />);

    expect(chip()).toHaveTextContent("In progress");
    expect(chip()).toHaveAttribute("data-state", "in_progress");
  });

  it("shows the count and max distance for violations", () => {
    render(
      <GeofenceViolationBar
        record={base({
          geofenceViolations: [
            { start: localDate(10), end: localDate(10, 30), maxDistanceMeters: 400 },
            { start: localDate(14), end: localDate(14, 20), maxDistanceMeters: 1200 },
          ],
        })}
      />
    );

    expect(chip()).toHaveTextContent("2 excursions · max 1.2 km");
    expect(chip()).toHaveAttribute("data-state", "violations");
  });

  it("shows 'No data' when the geofence was never evaluated", () => {
    render(<GeofenceViolationBar record={base({ checkIn: { time: null }, checkOut: { time: null } })} />);

    expect(chip()).toHaveTextContent("No data");
    expect(chip()).toHaveAttribute("data-state", "no_data");
  });

  /**
   * The flaw the rewrite exists to kill: the old bar painted a shift with no
   * position data exactly like one fully inside the geofence.
   */
  it("makes 'No data' VISUALLY distinct from 'Within range'", () => {
    const { unmount } = render(
      <GeofenceViolationBar record={base({ checkIn: { time: null }, checkOut: { time: null } })} />
    );
    const noData = {
      text: chip().textContent,
      state: chip().getAttribute("data-state"),
      className: chip().className,
    };
    unmount();

    render(<GeofenceViolationBar record={base()} />);
    const within = {
      text: chip().textContent,
      state: chip().getAttribute("data-state"),
      className: chip().className,
    };

    expect(noData.text).not.toBe(within.text);
    expect(noData.state).not.toBe(within.state);
    // Not merely different text in the same green chip — a dashed, neutral
    // treatment, because a solid gray chip beside a green one still scans as
    // a pass.
    expect(noData.className).not.toBe(within.className);
    expect(noData.className).toMatch(/border-dashed/);
  });
});

describe("Geofence chip — tooltip", () => {
  it("explains that No data is not a pass", () => {
    render(<GeofenceViolationBar record={base({ checkIn: { time: null }, checkOut: { time: null } })} />);

    expect(tooltipText()).toMatch(/not a pass/i);
  });

  it("lists each violation's clock range and max distance", () => {
    render(
      <GeofenceViolationBar
        record={base({
          geofenceViolations: [
            { start: localDate(10), end: localDate(10, 30), maxDistanceMeters: 400 },
            { start: localDate(14), end: localDate(14, 20), maxDistanceMeters: 1200 },
          ],
        })}
      />
    );

    const title = tooltipText();
    expect(title).toContain("10:00 AM");
    expect(title).toContain("10:30 AM");
    expect(title).toContain("400 m");
    expect(title).toContain("2:00 PM");
    expect(title).toContain("1.2 km");
  });

  it("says 'checkout' for a still-open violation rather than printing nothing", () => {
    render(
      <GeofenceViolationBar
        record={base({
          checkOut: { time: null },
          geofenceViolations: [{ start: localDate(15), end: null, maxDistanceMeters: 800 }],
        })}
      />
    );

    expect(tooltipText()).toContain("checkout");
  });

  it("renders exactly ONE tooltip trigger", () => {
    render(<GeofenceViolationBar record={base()} />);

    expect(document.querySelectorAll("[data-tooltip-trigger]")).toHaveLength(1);
  });
});

describe("Geofence chip — investigating an excursion", () => {
  it("is clickable ONLY when there are violations and a handler exists", () => {
    const onInvestigate = vi.fn();
    const { unmount } = render(<GeofenceViolationBar record={base()} onInvestigate={onInvestigate} />);

    // A clean shift has nothing to investigate.
    expect(chip()).not.toHaveAttribute("role", "button");
    unmount();

    render(
      <GeofenceViolationBar
        record={base({
          geofenceViolations: [{ start: localDate(10), end: localDate(11), maxDistanceMeters: 400 }],
        })}
        onInvestigate={onInvestigate}
      />
    );

    expect(chip()).toHaveAttribute("role", "button");
  });

  it("hands the record back, and does NOT also trigger the row's own click", () => {
    const onInvestigate = vi.fn();
    const onRowClick = vi.fn();
    const record = base({
      geofenceViolations: [{ start: localDate(10), end: localDate(11), maxDistanceMeters: 400 }],
    });

    // A button stand-in for the table row, which carries its own onClick.
    render(
      <button type="button" onClick={onRowClick}>
        <GeofenceViolationBar record={record} onInvestigate={onInvestigate} />
      </button>
    );

    fireEvent.click(chip());

    expect(onInvestigate).toHaveBeenCalledWith(record);
    // The table row opens the photo modal on click; without stopPropagation
    // the chip would open two things at once.
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it("stays inert when no handler is supplied, even with violations", () => {
    render(
      <GeofenceViolationBar
        record={base({
          geofenceViolations: [{ start: localDate(10), end: localDate(11), maxDistanceMeters: 400 }],
        })}
      />
    );

    expect(chip()).not.toHaveAttribute("role", "button");
  });
});
