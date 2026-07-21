import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import AttendanceTeamPage from "./AttendanceTeamPage";
import useSessionStore from "../store/sessionStore";

vi.mock("../modules/attendance/hooks/useTeamAttendance", () => ({
  default: () => ({ records: [], isLoading: false }),
}));
vi.mock("../hooks/useUserDirectory", () => ({
  default: () => ({ users: [] }),
}));

describe("AttendanceTeamPage — manager/admin only", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a 403 result for a role with no attendance.view_team/view_all grant", () => {
    useSessionStore.setState({
      user: { _id: "emp-1", role: "employee", permissions: { attendance: {} } },
      isAuthenticated: true,
      isLoading: false,
    });

    render(<AttendanceTeamPage />);

    expect(screen.getByText("Not authorized")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("renders the team view for a manager holding attendance.view_team", () => {
    useSessionStore.setState({
      user: { _id: "mgr-1", role: "manager", permissions: { attendance: { view_team: true } } },
      isAuthenticated: true,
      isLoading: false,
    });

    render(<AttendanceTeamPage />);

    expect(screen.queryByText("Not authorized")).not.toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("renders the team view for an admin (view_all)", () => {
    useSessionStore.setState({
      user: { _id: "admin-1", role: "admin", permissions: {} },
      isAuthenticated: true,
      isLoading: false,
    });

    render(<AttendanceTeamPage />);

    expect(screen.queryByText("Not authorized")).not.toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
  });
});
