import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import dayjs from "dayjs";
import AttendanceCalendar from "./AttendanceCalendar";

const JUNE_2026 = dayjs("2026-06-15");

const PRESENT_RECORD = {
  _id: "att-1",
  date: "2026-06-03T00:00:00.000Z",
  status: "present",
};

const ABSENT_RECORD = {
  _id: "att-2",
  date: "2026-06-04T00:00:00.000Z",
  status: "absent",
};

const MANUALLY_ADJUSTED_RECORD = {
  _id: "att-3",
  date: "2026-06-05T00:00:00.000Z",
  status: "on_leave",
  isManuallyAdjusted: true,
};

const GEOFENCE_VIOLATION_RECORD = {
  _id: "att-4",
  date: "2026-06-06T00:00:00.000Z",
  status: "present",
  geofenceViolations: [
    { start: "2026-06-06T12:00:00.000Z", end: "2026-06-06T12:30:00.000Z", maxDistanceMeters: 700 },
  ],
};

describe("AttendanceCalendar", () => {
  it("color-codes each day by its record's status", () => {
    render(<AttendanceCalendar month={JUNE_2026} records={[PRESENT_RECORD, ABSENT_RECORD]} onDayClick={vi.fn()} />);

    expect(screen.getByTestId("attendance-calendar-day-2026-06-03")).toHaveClass("bg-green-100");
    expect(screen.getByTestId("attendance-calendar-day-2026-06-04")).toHaveClass("bg-red-100");
  });

  it("renders a day with no record as neutral grey, not red/absent", () => {
    render(<AttendanceCalendar month={JUNE_2026} records={[]} onDayClick={vi.fn()} />);

    const noRecordDay = screen.getByTestId("attendance-calendar-day-2026-06-10");
    expect(noRecordDay).toHaveClass("bg-gray-50");
    expect(noRecordDay).not.toHaveClass("bg-red-100");
  });

  it("shows a marker on a manually-adjusted record's day, and no marker on a normal one", () => {
    render(<AttendanceCalendar month={JUNE_2026} records={[PRESENT_RECORD, MANUALLY_ADJUSTED_RECORD]} onDayClick={vi.fn()} />);

    expect(screen.getByTestId("attendance-manual-marker-2026-06-05")).toBeInTheDocument();
    expect(screen.queryByTestId("attendance-manual-marker-2026-06-03")).not.toBeInTheDocument();
  });

  it("shows a distinct marker on a day with a geofence violation, and no marker on a normal one", () => {
    render(<AttendanceCalendar month={JUNE_2026} records={[PRESENT_RECORD, GEOFENCE_VIOLATION_RECORD]} onDayClick={vi.fn()} />);

    expect(screen.getByTestId("attendance-geofence-marker-2026-06-06")).toBeInTheDocument();
    expect(screen.queryByTestId("attendance-geofence-marker-2026-06-03")).not.toBeInTheDocument();
  });

  it("shows both markers on a day that is both manually-adjusted and has a geofence violation, without one overwriting the other", () => {
    const bothIssuesRecord = { ...MANUALLY_ADJUSTED_RECORD, geofenceViolations: GEOFENCE_VIOLATION_RECORD.geofenceViolations };
    render(<AttendanceCalendar month={JUNE_2026} records={[bothIssuesRecord]} onDayClick={vi.fn()} />);

    expect(screen.getByTestId("attendance-manual-marker-2026-06-05")).toBeInTheDocument();
    expect(screen.getByTestId("attendance-geofence-marker-2026-06-05")).toBeInTheDocument();
  });

  it("calls onDayClick with the date and record (or undefined) when a cell is clicked", async () => {
    const onDayClick = vi.fn();
    render(<AttendanceCalendar month={JUNE_2026} records={[PRESENT_RECORD]} onDayClick={onDayClick} />);

    await userEvent.click(screen.getByTestId("attendance-calendar-day-2026-06-03"));
    expect(onDayClick).toHaveBeenLastCalledWith(expect.anything(), PRESENT_RECORD);

    await userEvent.click(screen.getByTestId("attendance-calendar-day-2026-06-10"));
    expect(onDayClick).toHaveBeenLastCalledWith(expect.anything(), undefined);
  });
});
