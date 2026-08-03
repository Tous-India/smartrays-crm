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

describe("AttendanceRecordsSection — view toggle", () => {
  it("defaults to the List view and switches to Calendar", async () => {
    renderSection();

    expect(screen.getByRole("table")).toBeInTheDocument();

    await userEvent.click(screen.getByText("Calendar"));

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByTestId("attendance-calendar-day-2026-06-03")).toBeInTheDocument();
  });
});

function clickFirstDataRow() {
  const rows = screen.getAllByRole("row");
  // rows[0] is the header row.
  return userEvent.click(within(rows[1]).getByText("Present"));
}

describe("AttendanceRecordsSection — photo viewer", () => {
  it("opens the photo modal when a list row is clicked", async () => {
    renderSection();

    await clickFirstDataRow();

    expect(await screen.findByText(/Attendance —/)).toBeInTheDocument();
    // Read-only — no Edit Record action inside the modal either.
    expect(screen.queryByRole("button", { name: /Edit Record/ })).not.toBeInTheDocument();
  });

  it("opens the photo modal from a calendar day with a real record", async () => {
    renderSection();

    await userEvent.click(screen.getByText("Calendar"));
    await userEvent.click(screen.getByTestId("attendance-calendar-day-2026-06-03"));

    expect(await screen.findByText(/Attendance —/)).toBeInTheDocument();
  });
});
