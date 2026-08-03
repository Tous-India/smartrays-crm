import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import LeavePendingRequestsWidget from "./LeavePendingRequestsWidget";
import useSessionStore from "../../../store/sessionStore";
import * as leaveApi from "../../leave/api/leaveApi";
import * as userDirectoryApi from "../../../services/userDirectoryApi";

vi.mock("../../leave/api/leaveApi", () => ({
  listLeave: vi.fn(),
}));

vi.mock("../../../services/userDirectoryApi", () => ({
  fetchUserDropdown: vi.fn(),
}));

function renderWidget() {
  return render(
    <MemoryRouter>
      <LeavePendingRequestsWidget />
    </MemoryRouter>
  );
}

describe("LeavePendingRequestsWidget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userDirectoryApi.fetchUserDropdown.mockResolvedValue({
      data: { data: [{ _id: "emp-1", name: "Priya Employee", role: "employee" }] },
    });
    useSessionStore.setState({
      user: { _id: "admin-1", role: "admin", permissions: {} },
      isAuthenticated: true,
      isLoading: false,
    });
  });

  it("filters to pending leaves and resolves the employee name via the user directory, for an admin (scope=all)", async () => {
    leaveApi.listLeave.mockResolvedValue({
      data: {
        data: [
          { _id: "l1", employeeId: "emp-1", status: "pending", reason: "Family event" },
          { _id: "l2", employeeId: "emp-1", status: "approved" },
        ],
      },
    });

    renderWidget();

    expect(await screen.findByText("Priya Employee")).toBeInTheDocument();
    expect(screen.getByText("1", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Family event")).toBeInTheDocument();
    expect(leaveApi.listLeave).toHaveBeenCalledWith("all");
  });

  it("shows an inline error instead of crashing when the fetch rejects", async () => {
    leaveApi.listLeave.mockRejectedValue(new Error("down"));

    renderWidget();

    expect(await screen.findByText("Couldn't load this widget")).toBeInTheDocument();
  });

  it("renders nothing for a role holding neither approve nor a view tier", async () => {
    useSessionStore.setState({
      user: { _id: "employee-1", role: "employee", permissions: { leave: { view: true } } },
      isAuthenticated: true,
      isLoading: false,
    });

    const { container } = renderWidget();

    await waitFor(() => {
      expect(leaveApi.listLeave).not.toHaveBeenCalled();
    });
    expect(container).toBeEmptyDOMElement();
  });

  // Manager parity (§7.5c, 2026-07-31 — reverses the earlier "manager can
  // view but not approve" restriction): a manager now holds `leave.approve`
  // by default, but not `leave.view_all` — this widget must fall back to
  // `scope="team"` for them rather than calling `listLeave("all")`, which
  // would 403 for a manager without that grant.
  it("shows for a manager holding the new default team-scoped grant, scoped to their team", async () => {
    useSessionStore.setState({
      user: { _id: "manager-1", role: "manager", permissions: { leave: { view_team: true, approve: true } } },
      isAuthenticated: true,
      isLoading: false,
    });
    leaveApi.listLeave.mockResolvedValue({
      data: { data: [{ _id: "l1", employeeId: "emp-1", status: "pending" }] },
    });

    renderWidget();

    expect(await screen.findByText("Priya Employee")).toBeInTheDocument();
    expect(leaveApi.listLeave).toHaveBeenCalledWith("team");
  });

  it("renders nothing for a manager who holds view_team but not approve", async () => {
    useSessionStore.setState({
      user: { _id: "manager-1", role: "manager", permissions: { leave: { view_team: true } } },
      isAuthenticated: true,
      isLoading: false,
    });

    const { container } = renderWidget();

    await waitFor(() => {
      expect(leaveApi.listLeave).not.toHaveBeenCalled();
    });
    expect(container).toBeEmptyDOMElement();
  });
});
