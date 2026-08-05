import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AttendancePage from "./AttendancePage";
import useSessionStore from "../store/sessionStore";
import * as attendanceApi from "../modules/attendance/api/attendanceApi";
import * as userApi from "../modules/user/api/userApi";
import * as leaveApi from "../modules/leave/api/leaveApi";

vi.mock("../hooks/useUserDirectory", () => ({
  default: () => ({ users: [] }),
}));
vi.mock("../modules/team/hooks/useTeams", () => ({
  default: () => ({ teams: [] }),
}));
vi.mock("../modules/attendance/hooks/useMyAttendance", () => ({
  default: () => ({ records: [], isLoading: false, refetch: vi.fn() }),
}));
vi.mock("../modules/attendance/hooks/useTeamAttendance", () => ({
  default: () => ({ records: [], isLoading: false, refetch: vi.fn() }),
}));
vi.mock("../modules/attendance/api/attendanceApi", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getTeamAttendance: vi.fn() };
});
vi.mock("../modules/user/api/userApi", () => ({
  listUsers: vi.fn(),
}));
vi.mock("../modules/leave/api/leaveApi", () => ({
  listLeave: vi.fn(),
  requestLeave: vi.fn(),
  approveLeave: vi.fn(),
  declineLeave: vi.fn(),
  markUnapprovedAbsence: vi.fn(),
  deleteLeave: vi.fn(),
  getLeaveBalance: vi.fn(),
}));

function setUser(user) {
  useSessionStore.setState({ user, isAuthenticated: true, isLoading: false });
}

beforeEach(() => {
  vi.clearAllMocks();
  attendanceApi.getTeamAttendance.mockResolvedValue({ data: { data: [] } });
  userApi.listUsers.mockResolvedValue({ data: { data: [] } });
  leaveApi.listLeave.mockResolvedValue({ data: { data: [] } });
  leaveApi.getLeaveBalance.mockResolvedValue({
    data: { data: { paidLeaveUsed: 0, paidLeaveLimit: 1, paidLeaveRemaining: 1 } },
  });
});

/**
 * §B1 (2026-08-05) — Leave was absorbed into `/attendance` as tabs. The tab
 * SET is role-shaped; this covers that each role gets the right one, and
 * that the move didn't change any permission.
 */
describe("AttendancePage — role-based tabs", () => {
  it("gives an employee My Attendance | Apply Leave | My Leave", () => {
    setUser({ _id: "emp-1", role: "employee", permissions: { leave: { view: true } } });

    render(<AttendancePage />);

    expect(screen.getByRole("tab", { name: "My Attendance" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Apply Leave" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "My Leave" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Team Attendance" })).not.toBeInTheDocument();
  });

  it("gives a manager My Attendance | Team Attendance | Leave", () => {
    setUser({
      _id: "mgr-1",
      role: "manager",
      permissions: { attendance: { view_team: true }, leave: { view: true, view_team: true } },
    });

    render(<AttendancePage />);

    expect(screen.getByRole("tab", { name: "My Attendance" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Team Attendance" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Leave" })).toBeInTheDocument();
    // The Own/Team split stays INSIDE the Leave tab, not as more top-level tabs.
    expect(screen.queryByRole("tab", { name: "Leave Requests" })).not.toBeInTheDocument();
  });

  it("gives an admin Attendance | Leave Requests | Leave History", () => {
    setUser({ _id: "admin-1", role: "admin", permissions: {} });

    render(<AttendancePage />);

    expect(screen.getByRole("tab", { name: "Attendance" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Leave Requests" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Leave History" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "My Attendance" })).not.toBeInTheDocument();
  });

  it("a manager without attendance.view_team falls back to the employee tab set", () => {
    setUser({ _id: "mgr-2", role: "manager", permissions: { leave: { view: true } } });

    render(<AttendancePage />);

    expect(screen.queryByRole("tab", { name: "Team Attendance" })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Apply Leave" })).toBeInTheDocument();
  });

  it("switching a manager to Team Attendance renders the team view", async () => {
    setUser({
      _id: "mgr-1",
      role: "manager",
      permissions: { attendance: { view_team: true }, leave: { view: true, view_team: true } },
    });

    render(<AttendancePage />);
    await userEvent.click(screen.getByRole("tab", { name: "Team Attendance" }));

    // The Status filter belongs to TeamAttendanceView, not the personal view.
    expect(await screen.findByRole("combobox", { name: "Status" })).toBeInTheDocument();
  });

  it("the admin Attendance tab renders the org-wide view with its Team filter", async () => {
    setUser({ _id: "admin-1", role: "admin", permissions: {} });

    render(<AttendancePage />);

    expect(await screen.findByRole("combobox", { name: "Team" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Date range" })).toBeInTheDocument();
  });
});
