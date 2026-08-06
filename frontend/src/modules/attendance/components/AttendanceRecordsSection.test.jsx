import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import dayjs from "dayjs";
import AttendanceRecordsSection from "./AttendanceRecordsSection";

const MONTH = dayjs("2026-06-15");

const RECORD = {
  _id: "att-1",
  employeeId: "emp-1",
  date: "2026-06-03T00:00:00.000Z",
  status: "present",
  checkIn: { time: "2026-06-03T09:00:00.000Z" },
  checkOut: { time: "2026-06-03T17:00:00.000Z" },
  workingHours: 8,
  connectivityGaps: [],
};

function renderSection(overrides = {}) {
  return render(<AttendanceRecordsSection records={[RECORD]} isLoading={false} month={MONTH} {...overrides} />);
}

describe("AttendanceRecordsSection — read-only (no correction UI, §7.4 reversal)", () => {
  it("never shows an Add Record button or any per-row Edit action", () => {
    renderSection();

    expect(screen.queryByRole("button", { name: /Add Record/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /edit/i })).not.toBeInTheDocument();
  });
});

describe("AttendanceRecordsSection — list/timeline only (§7.5e, 2026-07-31 — calendar view removed)", () => {
  it("always renders the table, with no List/Calendar toggle at all", () => {
    renderSection();

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.queryByText("Calendar")).not.toBeInTheDocument();
    expect(screen.queryByText("List")).not.toBeInTheDocument();
  });
});

/**
 * §7.4h (2026-08-06) — opens the detail modal through the explicit "View
 * details" action. This used to click a cell in the row, because the whole
 * ROW was the button; that handler is gone deliberately, so every column
 * opening the same modal with no signal is no longer possible.
 */
function openFirstRowDetails() {
  const rows = screen.getAllByRole("row");
  // rows[0] is the header row.
  return userEvent.click(within(rows[1]).getByRole("button", { name: "View details" }));
}

describe("AttendanceRecordsSection — photo viewer", () => {
  it("opens the photo modal from the row's View details action", async () => {
    renderSection();

    await openFirstRowDetails();

    expect(await screen.findByText(/Attendance —/)).toBeInTheDocument();
    // Read-only — no Edit Record action inside the modal either.
    expect(screen.queryByRole("button", { name: /Edit Record/ })).not.toBeInTheDocument();
  });
});
