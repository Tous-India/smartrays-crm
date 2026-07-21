import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AttendancePresentTodayWidget from "./AttendancePresentTodayWidget";
import useSessionStore from "../../../store/sessionStore";
import * as attendanceApi from "../../attendance/api/attendanceApi";

vi.mock("../../attendance/api/attendanceApi", () => ({
  getTeamAttendance: vi.fn(),
}));

function renderWidget() {
  return render(
    <MemoryRouter>
      <AttendancePresentTodayWidget />
    </MemoryRouter>
  );
}

const TODAY_ISO = new Date().toISOString();
const YESTERDAY_ISO = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

describe("AttendancePresentTodayWidget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSessionStore.setState({
      user: { _id: "admin-1", role: "admin", permissions: {} },
      isAuthenticated: true,
      isLoading: false,
    });
  });

  it("counts only today's present/half_day records from the fetched month", async () => {
    attendanceApi.getTeamAttendance.mockResolvedValue({
      data: {
        data: [
          { _id: "a1", date: TODAY_ISO, status: "present" },
          { _id: "a2", date: TODAY_ISO, status: "half_day" },
          { _id: "a3", date: TODAY_ISO, status: "absent" },
          { _id: "a4", date: YESTERDAY_ISO, status: "present" },
        ],
      },
    });

    renderWidget();

    expect(await screen.findByText("2")).toBeInTheDocument();
  });

  it("shows an inline error instead of crashing when the fetch rejects", async () => {
    attendanceApi.getTeamAttendance.mockRejectedValue(new Error("down"));

    renderWidget();

    expect(await screen.findByText("Couldn't load this widget")).toBeInTheDocument();
  });

  it("renders nothing for a user with neither attendance.view_team nor view_all", async () => {
    useSessionStore.setState({
      user: { _id: "manager-1", role: "manager", permissions: {} },
      isAuthenticated: true,
      isLoading: false,
    });

    const { container } = renderWidget();

    await waitFor(() => {
      expect(attendanceApi.getTeamAttendance).not.toHaveBeenCalled();
    });
    expect(container).toBeEmptyDOMElement();
  });
});
