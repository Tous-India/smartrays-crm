import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
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
  // The date filter defaults to Today (§B8), so "now" is pinned inside the
  // fixtures' own month and each test widens to This Month when it needs
  // both records.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 5, 4, 10, 0, 0));
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

async function renderThisMonth() {
  render(<AdminAttendanceView />);
  await userEvent.click(screen.getByRole("combobox", { name: "Date range" }));
  await userEvent.click(await screen.findByTitle("This Month"));
}

describe("AdminAttendanceView — org-wide, filterable (§7.4 reversal)", () => {
  it("shows org-wide attendance (both employees), not an empty table", async () => {
    await renderThisMonth();

    expect(await screen.findByText("Employee One")).toBeInTheDocument();
    expect(screen.getByText("Employee Two")).toBeInTheDocument();
    expect(attendanceApi.getTeamAttendance).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}$/));
  });

  it("never shows an Add Record button — read-only for admin too", async () => {
    await renderThisMonth();

    await screen.findByText("Employee One");
    expect(screen.queryByRole("button", { name: /Add Record/ })).not.toBeInTheDocument();
  });

  it("renders the Date range preset plus Employee, Team and Status filters", async () => {
    await renderThisMonth();

    await screen.findByText("Employee One");
    expect(screen.getByRole("combobox", { name: "Employee" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Team" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Status" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Date range" })).toBeInTheDocument();
  });

  it("filters the table down to one team via the Team select", async () => {
    await renderThisMonth();

    await screen.findByText("Employee One");

    await userEvent.click(screen.getByRole("combobox", { name: "Team" }));
    await userEvent.click(await screen.findByTitle("Support Team"));

    expect(await screen.findByText("Employee Two")).toBeInTheDocument();
    expect(screen.queryByText("Employee One")).not.toBeInTheDocument();
  });

  it("filters the table down by Status", async () => {
    await renderThisMonth();

    await screen.findByText("Employee One");

    await userEvent.click(screen.getByRole("combobox", { name: "Status" }));
    await userEvent.click(await screen.findByTitle("Absent"));

    expect(await screen.findByText("Employee Two")).toBeInTheDocument();
    expect(screen.queryByText("Employee One")).not.toBeInTheDocument();
  });

  it("shows a Team column resolving each employee to their team (2026-08-05)", async () => {
    await renderThisMonth();

    await screen.findByText("Employee One");

    expect(screen.getByRole("columnheader", { name: "Team" })).toBeInTheDocument();
    expect(await screen.findByText("Sales Team")).toBeInTheDocument();
    expect(screen.getByText("Support Team")).toBeInTheDocument();
  });

  it("keeps the Employee column visible after filtering to one employee — filtered rows still identify who they belong to", async () => {
    await renderThisMonth();

    await screen.findByText("Employee One");

    await userEvent.click(screen.getByRole("combobox", { name: "Employee" }));
    await userEvent.click(await screen.findByTitle("Employee One"));

    // The row for the filtered employee must still show their name in the
    // table itself. Targeted by the real record's own row key — filtering to
    // one employee also surfaces synthetic missing-day rows for them
    // (2026-08-05), which legitimately carry the same name.
    const realRow = document.querySelector('[data-row-key="att-1"]');
    expect(realRow).toBeInTheDocument();
    expect(within(realRow).getByText("Employee One")).toBeInTheDocument();
    expect(screen.queryByRole("row", { name: /Employee Two/ })).not.toBeInTheDocument();
  });

  it("shows photo/location viewing capability unaffected (showPhotos/showLocation passed through)", async () => {
    await renderThisMonth();

    await screen.findByText("Employee One");
    const row = screen.getByRole("row", { name: /Employee One/ });
    await userEvent.click(row);

    expect(await screen.findByText(/Attendance —/)).toBeInTheDocument();
  });
});

/**
 * Gap-filling (2026-08-05) — the table only ever rendered real records, so a
 * day nobody checked in on had no row at all. Selecting one employee now
 * surfaces those days as synthetic rows carrying the two mark actions.
 */
describe("AdminAttendanceView — Mark Absent / Mark Half Day on missing days", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    attendanceApi.getTeamAttendance.mockResolvedValue({ data: { data: [RECORD_EMP1, RECORD_EMP2] } });
    attendanceApi.markAttendanceStatus = vi.fn().mockResolvedValue({ data: { data: {} } });
    userApi.listUsers.mockResolvedValue({
      data: {
        data: [
          { _id: "emp-1", name: "Employee One", role: "employee", managerId: "mgr-1" },
          { _id: "emp-2", name: "Employee Two", role: "employee", managerId: "mgr-2" },
        ],
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function filterToEmployeeOne() {
    await renderThisMonth();
    await screen.findByText("Employee One");
    await userEvent.click(screen.getByRole("combobox", { name: "Employee" }));
    await userEvent.click(await screen.findByTitle("Employee One"));
  }

  it("shows no mark actions until a single employee is selected", async () => {
    await renderThisMonth();
    await screen.findByText("Employee One");

    expect(screen.queryByRole("button", { name: "Mark Absent" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark Half Day" })).not.toBeInTheDocument();
  });

  it("surfaces missing-day rows with both mark actions once an employee is selected", async () => {

    await filterToEmployeeOne();

    // 01, 02, 04 June are missing (03 has a real record; 05+ is the future).
    expect(document.querySelector('[data-row-key="missing-emp-1-2026-06-01"]')).toBeInTheDocument();
    expect(document.querySelector('[data-row-key="missing-emp-1-2026-06-02"]')).toBeInTheDocument();
    expect(document.querySelector('[data-row-key="missing-emp-1-2026-06-04"]')).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Mark Absent" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Mark Half Day" }).length).toBeGreaterThan(0);
  });

  it("never shows mark actions on a row that already has a real record", async () => {

    await filterToEmployeeOne();

    const realRow = document.querySelector('[data-row-key="att-1"]');
    expect(within(realRow).queryByRole("button", { name: "Mark Absent" })).not.toBeInTheDocument();
    expect(within(realRow).queryByRole("button", { name: "Mark Half Day" })).not.toBeInTheDocument();
  });

  it("submits the mark after confirming, with the row's own date", async () => {

    await filterToEmployeeOne();

    const missingRow = document.querySelector('[data-row-key="missing-emp-1-2026-06-02"]');
    await userEvent.click(within(missingRow).getByRole("button", { name: "Mark Absent" }));

    // Nothing submitted until the confirmation is accepted.
    expect(attendanceApi.markAttendanceStatus).not.toHaveBeenCalled();

    // Scoped to the popconfirm — its OK button's label is deliberately the
    // same words as the icon button's own aria-label.
    const popconfirm = await screen.findByText("Mark this day as Absent?");
    const confirmButton = within(popconfirm.closest(".ant-popover-inner")).getByRole("button", {
      name: "Mark Absent",
    });
    await userEvent.click(confirmButton);

    await waitFor(() => {
      expect(attendanceApi.markAttendanceStatus).toHaveBeenCalledWith({
        employeeId: "emp-1",
        date: "2026-06-02",
        status: "absent",
      });
    });
  });
});

/**
 * §B2 (2026-08-05) — the Employee filter rendered a raw Mongo ObjectId for
 * anyone missing from the lightweight active-users dropdown (a deactivated
 * or deleted employee), which is meaningless to a human reading the filter.
 */
describe("AdminAttendanceView — Employee filter never shows a raw ObjectId", () => {
  it("labels an employee resolved only via the full roster, not the active-user dropdown", async () => {
    const ORPHAN_ID = "6a704caa9e775d7c64966786";
    attendanceApi.getTeamAttendance.mockResolvedValue({
      data: { data: [{ ...RECORD_EMP1, _id: "att-x", employeeId: ORPHAN_ID }] },
    });
    // Present in the FULL roster (e.g. deactivated) but not in the dropdown.
    userApi.listUsers.mockResolvedValue({
      data: { data: [{ _id: ORPHAN_ID, name: "Departed Person", role: "employee", managerId: null }] },
    });

    await renderThisMonth();
    await userEvent.click(screen.getByRole("combobox", { name: "Employee" }));

    expect(await screen.findByTitle("Departed Person")).toBeInTheDocument();
    expect(screen.queryByTitle(ORPHAN_ID)).not.toBeInTheDocument();
  });

  it("falls back to a human label, never the id, when the roster cannot resolve them either", async () => {
    const UNKNOWN_ID = "6a704caa9e775d7c64966999";
    attendanceApi.getTeamAttendance.mockResolvedValue({
      data: { data: [{ ...RECORD_EMP1, _id: "att-y", employeeId: UNKNOWN_ID }] },
    });
    userApi.listUsers.mockResolvedValue({ data: { data: [] } });

    await renderThisMonth();
    await userEvent.click(screen.getByRole("combobox", { name: "Employee" }));

    expect(await screen.findByTitle("Unknown employee")).toBeInTheDocument();
    expect(screen.queryByTitle(UNKNOWN_ID)).not.toBeInTheDocument();
  });
});
