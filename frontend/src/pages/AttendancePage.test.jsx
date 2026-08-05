import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AttendancePage from "./AttendancePage";
import useSessionStore from "../store/sessionStore";
import * as attendanceApi from "../modules/attendance/api/attendanceApi";
import * as userApi from "../modules/user/api/userApi";

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

/**
 * `/attendance` routes by role (2026-07-31, §7.4 reversal) — admin gets the
 * org-wide `AdminAttendanceView` (distinguishable here by its Team filter,
 * which only that view renders), everyone else keeps the existing
 * `PersonalAttendanceView` (the check-in widget's absence for admin is
 * already covered by that component's own pre-existing behavior).
 */
describe("AttendancePage — role-based routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    attendanceApi.getTeamAttendance.mockResolvedValue({ data: { data: [] } });
    userApi.listUsers.mockResolvedValue({ data: { data: [] } });
  });

  it("renders AdminAttendanceView (org-wide, with a Team filter) for admin", async () => {
    useSessionStore.setState({
      user: { _id: "admin-1", role: "admin", permissions: {} },
      isAuthenticated: true,
      isLoading: false,
    });

    render(<AttendancePage />);

    expect(await screen.findByRole("combobox", { name: "Team" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Employee" })).toBeInTheDocument();
  });

  it("renders PersonalAttendanceView (no Team filter) for a manager", () => {
    useSessionStore.setState({
      user: { _id: "mgr-1", role: "manager", permissions: {} },
      isAuthenticated: true,
      isLoading: false,
    });

    render(<AttendancePage />);

    expect(screen.queryByRole("combobox", { name: "Team" })).not.toBeInTheDocument();
  });

  it("renders PersonalAttendanceView (no Team filter) for an employee", () => {
    useSessionStore.setState({
      user: { _id: "emp-1", role: "employee", permissions: {} },
      isAuthenticated: true,
      isLoading: false,
    });

    render(<AttendancePage />);

    expect(screen.queryByRole("combobox", { name: "Team" })).not.toBeInTheDocument();
  });
});

/**
 * Own/Team tabs (2026-08-05) — `TeamAttendanceView` existed and its endpoint
 * worked, but nothing ever routed to it for a manager, so team attendance
 * was unreachable in the UI.
 */
describe("AttendancePage — Own/Team tabs for a manager holding attendance.view_team", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    attendanceApi.getTeamAttendance.mockResolvedValue({ data: { data: [] } });
    userApi.listUsers.mockResolvedValue({ data: { data: [] } });
  });

  function renderAsManagerWithTeamGrant() {
    useSessionStore.setState({
      user: { _id: "mgr-1", role: "manager", permissions: { attendance: { view_team: true } } },
      isAuthenticated: true,
      isLoading: false,
    });

    return render(<AttendancePage />);
  }

  it("shows Own and Team tabs, defaulting to Own", () => {
    renderAsManagerWithTeamGrant();

    expect(screen.getByText("Own")).toBeInTheDocument();
    expect(screen.getByText("Team")).toBeInTheDocument();
  });

  it("switching to the Team tab renders the team view, which the manager could not reach before", async () => {
    const user = userEvent.setup();
    renderAsManagerWithTeamGrant();

    await user.click(screen.getByText("Team"));

    // The Status filter is rendered by TeamAttendanceView, not by
    // PersonalAttendanceView — its presence proves the switch happened.
    expect(await screen.findByRole("combobox", { name: "Status" })).toBeInTheDocument();
  });

  it("shows no tabs at all for a manager without the view_team grant", () => {
    useSessionStore.setState({
      user: { _id: "mgr-2", role: "manager", permissions: {} },
      isAuthenticated: true,
      isLoading: false,
    });

    render(<AttendancePage />);

    expect(screen.queryByText("Team")).not.toBeInTheDocument();
  });
});
