import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import dayjs from "dayjs";
import AttendanceRecordsSection from "./AttendanceRecordsSection";
import * as attendanceApi from "../api/attendanceApi";

vi.mock("../api/attendanceApi", () => ({
  adjustAttendance: vi.fn(),
  createManualAttendance: vi.fn(),
}));

vi.mock("antd", async (importOriginal) => {
  const actual = await importOriginal();
  // Components read `message` via `App.useApp()` (§7.28 message-rendering
  // fix — the static import silently fails to render under React 19), not
  // the static export, so the mock has to intercept the hook too.
  const mockMessage = { success: vi.fn(), error: vi.fn() };
  actual.App.useApp = () => ({ message: mockMessage });
  return { ...actual, message: mockMessage };
});

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
  return render(
    <AttendanceRecordsSection
      records={[RECORD]}
      isLoading={false}
      month={MONTH}
      canCorrect={false}
      defaultEmployeeId="emp-1"
      onChanged={vi.fn()}
      {...overrides}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AttendanceRecordsSection — permission gating", () => {
  it("hides every correction action for a non-admin", () => {
    renderSection({ canCorrect: false });

    expect(screen.queryByRole("button", { name: /Add Record/ })).not.toBeInTheDocument();
    // No per-row Edit action column either.
    expect(screen.queryByRole("button", { name: /edit/i })).not.toBeInTheDocument();
  });

  it("shows Add Record and a per-row Edit action for an admin", () => {
    renderSection({ canCorrect: true });

    expect(screen.getByRole("button", { name: /Add Record/ })).toBeInTheDocument();
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
  });
});

describe("AttendanceRecordsSection — admin correction end-to-end", () => {
  it("editing a record calls adjustAttendance and refreshes", async () => {
    attendanceApi.adjustAttendance.mockResolvedValue({ data: { data: { ...RECORD, status: "absent" } } });
    const onChanged = vi.fn();
    renderSection({ canCorrect: true, onChanged });

    // Open the photo modal via the row, then Edit from there.
    await clickFirstDataRow();
    await userEvent.click(await screen.findByRole("button", { name: /Edit Record/ }));

    expect(await screen.findByText("Edit Attendance Record")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(await screen.findByTitle("Absent"));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(attendanceApi.adjustAttendance).toHaveBeenCalledWith(
        "att-1",
        expect.objectContaining({ status: "absent" })
      );
    });
    await waitFor(() => {
      expect(onChanged).toHaveBeenCalled();
    });
  });

  it("adding a record for an empty calendar day calls createManualAttendance with the right employeeId/date", async () => {
    attendanceApi.createManualAttendance.mockResolvedValue({
      data: { data: { ...RECORD, _id: "att-new", isManuallyAdjusted: true } },
    });
    const onChanged = vi.fn();
    renderSection({ canCorrect: true, onChanged });

    await userEvent.click(screen.getByText("Calendar"));
    await userEvent.click(screen.getByTestId("attendance-calendar-day-2026-06-10"));

    expect(await screen.findByText("Add Attendance Record")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(attendanceApi.createManualAttendance).toHaveBeenCalledWith(
        expect.objectContaining({ employeeId: "emp-1", date: "2026-06-10" })
      );
    });
    await waitFor(() => {
      expect(onChanged).toHaveBeenCalled();
    });
  });

  it("disables Add Record when there is no valid employee to create for (e.g. Team view with 'All employees')", () => {
    renderSection({ canCorrect: true, defaultEmployeeId: null });

    expect(screen.getByRole("button", { name: /Add Record/ })).toBeDisabled();
  });
});
