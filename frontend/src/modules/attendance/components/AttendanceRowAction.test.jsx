import { describe, it, expect, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AttendanceTimeline from "./AttendanceTimeline";

/**
 * §7.4h (2026-08-06) — the row-level `onRow` click is gone.
 *
 * It made the WHOLE row a button: every column opened the same
 * `AttendancePhotoModal`, byte-identical, with nothing signalling it. The two
 * columns carrying visual widgets got clicked and looked like they "did the
 * same thing" — Date and Status opened it too. One explicit "View details"
 * action replaces it, following `PaymentsTable`'s established Actions-cell
 * pattern (`type="text"` icon button + Tooltip + aria-label).
 */

function localDate(hour, minute = 0, dayOffset = 0) {
  return new Date(2026, 5, 1 + dayOffset, hour, minute, 0, 0);
}

const RECORD = {
  _id: "att-1",
  employeeId: "emp-1",
  date: localDate(0),
  checkIn: { time: localDate(9), coords: { lat: 1, lng: 2 } },
  checkOut: { time: localDate(18) },
  connectivityGaps: [],
  geofenceViolations: [],
  status: "present",
};

const MISSING_DAY = {
  _id: "missing-1",
  employeeId: "emp-1",
  date: localDate(0, 0, 1),
  isMissingDay: true,
  connectivityGaps: [],
  geofenceViolations: [],
};

function cellFor(columnName) {
  // textContent, not innerText — jsdom does not implement innerText.
  const headers = [...document.querySelectorAll("thead tr:first-child th")].map((th) =>
    th.textContent.trim()
  );
  const index = headers.indexOf(columnName);
  const row = document.querySelector("tbody tr.ant-table-row");

  return row.querySelectorAll("td")[index];
}

describe("Attendance row — no whole-row click handler", () => {
  it.each(["Date", "Timeline", "Geofence", "Status"])(
    "does NOT open the detail modal when the %s cell is clicked",
    (column) => {
      const onRowClick = vi.fn();
      render(<AttendanceTimeline records={[RECORD]} isLoading={false} onRowClick={onRowClick} />);

      fireEvent.click(cellFor(column));

      expect(onRowClick).not.toHaveBeenCalled();
    }
  );

  it("does not mark rows as clickable any more", () => {
    render(<AttendanceTimeline records={[RECORD]} isLoading={false} onRowClick={vi.fn()} />);

    // The cursor-pointer class was the only (weak) hint the row was a button.
    expect(document.querySelector("tbody tr.ant-table-row").className).not.toMatch(/cursor-pointer/);
  });
});

describe("Attendance row — the explicit affordance", () => {
  it("opens the detail modal from the View details action, with that record", async () => {
    const onRowClick = vi.fn();
    render(<AttendanceTimeline records={[RECORD]} isLoading={false} onRowClick={onRowClick} />);

    await userEvent.click(screen.getByRole("button", { name: "View details" }));

    expect(onRowClick).toHaveBeenCalledWith(RECORD);
  });

  it("renders the action even when no mark-status handler is supplied", () => {
    // The Actions column used to exist only for admins (it was gated on
    // `onMarkStatus`), so gating Details on it too would leave Personal and
    // Team views with no way into the modal at all.
    render(<AttendanceTimeline records={[RECORD]} isLoading={false} onRowClick={vi.fn()} />);

    expect(screen.getByRole("button", { name: "View details" })).toBeInTheDocument();
  });

  it("keeps synthetic missing-day rows inert — no Details action", () => {
    render(<AttendanceTimeline records={[MISSING_DAY]} isLoading={false} onRowClick={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "View details" })).not.toBeInTheDocument();
  });

  it("renders no action at all when the parent supplies no handler", () => {
    render(<AttendanceTimeline records={[RECORD]} isLoading={false} />);

    expect(screen.queryByRole("button", { name: "View details" })).not.toBeInTheDocument();
  });
});

describe("Attendance row — Popconfirm still works on missing days", () => {
  it("confirms before marking a day absent", async () => {
    const onMarkStatus = vi.fn();
    render(
      <AttendanceTimeline
        records={[MISSING_DAY]}
        isLoading={false}
        onRowClick={vi.fn()}
        onMarkStatus={onMarkStatus}
      />
    );

    // The icon button in the cell — the Popconfirm's OK button shares its
    // label, so this is scoped to the table body.
    const cell = document.querySelector("tbody tr.ant-table-row");
    await userEvent.click(within(cell).getByRole("button", { name: "Mark Absent" }));

    // The confirmation must still appear — the action is destructive and
    // cannot be undone from this screen.
    expect(await screen.findByText(/has no attendance record/)).toBeInTheDocument();

    const popup = document.querySelector(".ant-popconfirm");
    await userEvent.click(within(popup).getByRole("button", { name: "Mark Absent" }));

    expect(onMarkStatus).toHaveBeenCalledWith(MISSING_DAY, "absent");
  });

  it("still offers both gap-filling actions on a missing day", () => {
    render(
      <AttendanceTimeline
        records={[MISSING_DAY]}
        isLoading={false}
        onRowClick={vi.fn()}
        onMarkStatus={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Mark Absent" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark Half Day" })).toBeInTheDocument();
  });
});

describe("Attendance row — the Geofence chip keeps its own route", () => {
  it("opens the map modal directly, without going through the detail modal", async () => {
    const onRowClick = vi.fn();
    render(
      <AttendanceTimeline
        records={[
          {
            ...RECORD,
            geofenceViolations: [
              { start: localDate(14), end: localDate(14, 20), maxDistanceMeters: 1200 },
            ],
          },
        ]}
        isLoading={false}
        onRowClick={onRowClick}
      />
    );

    const chip = screen.getByTestId("geofence-chip");
    expect(chip).toHaveAttribute("role", "button");

    await userEvent.click(chip);

    // Its own modal, not the detail modal — and the (now absent) row handler
    // must not fire either.
    expect(await screen.findByText(/^Location —/)).toBeInTheDocument();
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it("leaves a clean row's chip inert", () => {
    render(<AttendanceTimeline records={[RECORD]} isLoading={false} onRowClick={vi.fn()} />);

    const chip = within(document.querySelector("tbody tr.ant-table-row")).getByTestId("geofence-chip");
    expect(chip).not.toHaveAttribute("role", "button");
  });
});
