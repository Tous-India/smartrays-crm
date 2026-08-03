import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AdminAttendanceView from "./AdminAttendanceView";
import * as attendanceApi from "../api/attendanceApi";
import * as userApi from "../../user/api/userApi";

vi.mock("../api/attendanceApi", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getTeamAttendance: vi.fn() };
});
vi.mock("../../user/api/userApi", () => ({
  listUsers: vi.fn(),
}));
vi.mock("../../../hooks/useUserDirectory", () => ({
  default: () => ({
    users: [
      { _id: "emp-1", name: "Employee One" },
      { _id: "emp-2", name: "Employee Two" },
    ],
  }),
}));
vi.mock("../../team/hooks/useTeams", () => ({
  default: () => ({
    teams: [
      { _id: "team-1", name: "Sales Team", headManagerId: "mgr-1" },
      { _id: "team-2", name: "Support Team", headManagerId: "mgr-2" },
    ],
  }),
}));

const RECORD_EMP1 = {
  _id: "att-1",
  employeeId: "emp-1",
  date: "2026-06-03T00:00:00.000Z",
  status: "present",
  checkIn: { time: "2026-06-03T09:00:00.000Z" },
  checkOut: { time: "2026-06-03T17:00:00.000Z" },
  connectivityGaps: [],
};

const RECORD_EMP2 = {
  _id: "att-2",
  employeeId: "emp-2",
  date: "2026-06-05T00:00:00.000Z",
  status: "absent",
  checkIn: { time: null },
  checkOut: { time: null },
  connectivityGaps: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  attendanceApi.getTeamAttendance.mockResolvedValue({ data: { data: [RECORD_EMP1, RECORD_EMP2] } });
  userApi.listUsers.mockResolvedValue({
    data: {
      data: [
        { _id: "emp-1", name: "Employee One", role: "employee", managerId: "mgr-1" },
        { _id: "emp-2", name: "Employee Two", role: "employee", managerId: "mgr-2" },
      ],
    },
  });
});

describe("AdminAttendanceView — org-wide, filterable (§7.4 reversal)", () => {
  it("shows org-wide attendance (both employees), not an empty table", async () => {
    render(<AdminAttendanceView />);

    expect(await screen.findByText("Employee One")).toBeInTheDocument();
    expect(screen.getByText("Employee Two")).toBeInTheDocument();
    expect(attendanceApi.getTeamAttendance).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}$/));
  });

  it("never shows an Add Record button — read-only for admin too", async () => {
    render(<AdminAttendanceView />);

    await screen.findByText("Employee One");
    expect(screen.queryByRole("button", { name: /Add Record/ })).not.toBeInTheDocument();
  });

  it("renders all five filters: Employee, Team, Status, month picker, custom date range", async () => {
    render(<AdminAttendanceView />);

    await screen.findByText("Employee One");
    expect(screen.getByRole("combobox", { name: "Employee" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Team" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Status" })).toBeInTheDocument();
    // Month DatePicker + Custom Date Range RangePicker are both real inputs (antd renders <input>).
    expect(document.querySelectorAll(".ant-picker").length).toBeGreaterThanOrEqual(2);
  });

  it("filters the table down to one team via the Team select", async () => {
    render(<AdminAttendanceView />);

    await screen.findByText("Employee One");

    await userEvent.click(screen.getByRole("combobox", { name: "Team" }));
    await userEvent.click(await screen.findByTitle("Support Team"));

    expect(await screen.findByText("Employee Two")).toBeInTheDocument();
    expect(screen.queryByText("Employee One")).not.toBeInTheDocument();
  });

  it("filters the table down by Status", async () => {
    render(<AdminAttendanceView />);

    await screen.findByText("Employee One");

    await userEvent.click(screen.getByRole("combobox", { name: "Status" }));
    await userEvent.click(await screen.findByTitle("Absent"));

    expect(await screen.findByText("Employee Two")).toBeInTheDocument();
    expect(screen.queryByText("Employee One")).not.toBeInTheDocument();
  });

  it("shows photo/location viewing capability unaffected (showPhotos/showLocation passed through)", async () => {
    render(<AdminAttendanceView />);

    await screen.findByText("Employee One");
    const row = screen.getByRole("row", { name: /Employee One/ });
    await userEvent.click(row);

    expect(await screen.findByText(/Attendance —/)).toBeInTheDocument();
  });
});
