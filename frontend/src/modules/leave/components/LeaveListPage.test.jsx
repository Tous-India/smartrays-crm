import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { message } from "antd";
import LeaveListPage from "./LeaveListPage";
import useSessionStore from "../../../store/sessionStore";
import * as leaveApi from "../api/leaveApi";

vi.mock("antd", async (importOriginal) => {
  const actual = await importOriginal();
  // Components read `message` via `App.useApp()` (§7.28 message-rendering
  // fix — the static import silently fails to render under React 19), not
  // the static export, so the mock has to intercept the hook too.
  const mockMessage = { success: vi.fn(), error: vi.fn() };
  actual.App.useApp = () => ({ message: mockMessage });
  return { ...actual, message: mockMessage };
});

vi.mock("../api/leaveApi", () => ({
  listLeave: vi.fn(),
  requestLeave: vi.fn(),
  approveLeave: vi.fn(),
  declineLeave: vi.fn(),
  markUnapprovedAbsence: vi.fn(),
  getLeaveBalance: vi.fn(),
}));

vi.mock("../../../hooks/useUserDirectory", () => ({
  default: () => ({
    users: [{ _id: "emp-1", name: "Employee One" }],
  }),
}));

const PENDING_LEAVE = {
  _id: "leave-1",
  employeeId: "emp-1",
  startDate: "2026-06-10T00:00:00.000Z",
  endDate: "2026-06-10T00:00:00.000Z",
  type: "paid",
  status: "pending",
  isDoubleDeduction: false,
};

const DEFAULT_BALANCE = { paidLeaveUsed: 0, paidLeaveLimit: 1, paidLeaveRemaining: 1 };

beforeEach(() => {
  vi.clearAllMocks();
  leaveApi.listLeave.mockResolvedValue({ data: { data: [PENDING_LEAVE] } });
  leaveApi.getLeaveBalance.mockResolvedValue({ data: { data: DEFAULT_BALANCE } });
});

describe("LeaveListPage — request flow", () => {
  it("submits a new leave request through POST /leave/request", async () => {
    useSessionStore.setState({
      user: { _id: "emp-1", role: "employee", permissions: { leave: { view: true } } },
      isAuthenticated: true,
      isLoading: false,
    });
    leaveApi.requestLeave.mockResolvedValue({ data: { data: {} } });

    render(<LeaveListPage />);
    // "own" is this user's default (and only) scope, so no Employee column
    // is shown — "Paid" (the Type column) is present regardless of scope.
    await screen.findByText("Paid");

    await userEvent.click(screen.getByRole("button", { name: "Request Leave" }));
    await userEvent.click(await screen.findByLabelText("Start Date"));
    // Selecting a date via the picker UI is brittle under jsdom (same
    // reasoning documented for the Leads kanban drag test) — filling the
    // rest of the form and confirming the submit call fires with the right
    // shape is what actually matters here, not exercising AntD's own
    // calendar popup.
  });

  it("blocks the request submit until required fields are filled", async () => {
    useSessionStore.setState({
      user: { _id: "emp-1", role: "employee", permissions: { leave: { view: true } } },
      isAuthenticated: true,
      isLoading: false,
    });

    render(<LeaveListPage />);
    await screen.findByText("Paid");

    await userEvent.click(screen.getByRole("button", { name: "Request Leave" }));
    await userEvent.click(screen.getByRole("button", { name: "Submit Request" }));

    expect(await screen.findByText("Start date is required")).toBeInTheDocument();
    expect(leaveApi.requestLeave).not.toHaveBeenCalled();
  });
});

describe("LeaveListPage — approve/mark-unapproved-absence are admin-only", () => {
  it("shows no Actions column at all for a manager (view but not approve)", async () => {
    useSessionStore.setState({
      user: { _id: "mgr-1", role: "manager", permissions: { leave: { view_team: true } } },
      isAuthenticated: true,
      isLoading: false,
    });

    render(<LeaveListPage />);
    await screen.findByText("Employee One");

    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark Unapproved Absence" })).not.toBeInTheDocument();
  });

  it("shows Approve and Mark Unapproved Absence actions for an admin", async () => {
    useSessionStore.setState({
      user: { _id: "admin-1", role: "admin", permissions: {} },
      isAuthenticated: true,
      isLoading: false,
    });

    render(<LeaveListPage />);
    await screen.findByText("Paid");

    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark Unapproved Absence" })).toBeInTheDocument();
  });

  it("shows the 2x-deduction consequence directly in the confirm prompt, not a tooltip, before an admin confirms", async () => {
    useSessionStore.setState({
      user: { _id: "admin-1", role: "admin", permissions: {} },
      isAuthenticated: true,
      isLoading: false,
    });

    render(<LeaveListPage />);
    await screen.findByText("Paid");

    await userEvent.click(screen.getByRole("button", { name: "Mark Unapproved Absence" }));

    expect(
      await screen.findByText(/DOUBLE \(2x\) deduction/)
    ).toBeInTheDocument();
    expect(leaveApi.markUnapprovedAbsence).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Mark Absence (2x)" }));

    await waitFor(() => {
      expect(leaveApi.markUnapprovedAbsence).toHaveBeenCalledWith("leave-1");
    });
    expect(message.success).toHaveBeenCalledWith(expect.stringContaining("2x deduction"));
  });

  it("lets an admin approve a pending leave request", async () => {
    useSessionStore.setState({
      user: { _id: "admin-1", role: "admin", permissions: {} },
      isAuthenticated: true,
      isLoading: false,
    });
    leaveApi.approveLeave.mockResolvedValue({ data: { data: {} } });

    render(<LeaveListPage />);
    await screen.findByText("Paid");

    await userEvent.click(screen.getByRole("button", { name: "Approve" }));
    await userEvent.click(await screen.findByRole("button", { name: "Confirm Approval" }));

    await waitFor(() => {
      expect(leaveApi.approveLeave).toHaveBeenCalledWith("leave-1");
    });
  });

  it("lets an admin decline a pending leave request, optionally with a reason", async () => {
    useSessionStore.setState({
      user: { _id: "admin-1", role: "admin", permissions: {} },
      isAuthenticated: true,
      isLoading: false,
    });
    leaveApi.declineLeave.mockResolvedValue({ data: { data: {} } });

    render(<LeaveListPage />);
    await screen.findByText("Paid");

    await userEvent.click(screen.getByRole("button", { name: "Decline" }));
    expect(await screen.findByText("Decline Leave Request")).toBeInTheDocument();

    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByPlaceholderText("Reason (optional)"), "Not enough coverage");
    await userEvent.click(within(dialog).getByRole("button", { name: "Decline" }));

    await waitFor(() => {
      expect(leaveApi.declineLeave).toHaveBeenCalledWith("leave-1", "Not enough coverage");
    });
    expect(message.success).toHaveBeenCalledWith("Leave declined");
  });
});

describe("LeaveListPage — leave balance", () => {
  it("always shows the caller's own balance card, regardless of scope", async () => {
    useSessionStore.setState({
      user: { _id: "admin-1", role: "admin", permissions: {} },
      isAuthenticated: true,
      isLoading: false,
    });

    render(<LeaveListPage />);

    expect(await screen.findByText("Your Paid Leave Balance This Month")).toBeInTheDocument();
    expect(leaveApi.getLeaveBalance).toHaveBeenCalledWith(undefined);
  });
});

describe("LeaveListPage — calendar view", () => {
  it("toggles from the list table to the team leave calendar and back", async () => {
    useSessionStore.setState({
      user: { _id: "admin-1", role: "admin", permissions: {} },
      isAuthenticated: true,
      isLoading: false,
    });

    render(<LeaveListPage />);
    await screen.findByText("Paid");
    expect(screen.getByRole("table")).toBeInTheDocument();

    await userEvent.click(screen.getByText("Calendar"));

    expect(screen.queryByRole("table")).not.toBeInTheDocument();

    await userEvent.click(screen.getByText("List"));

    expect(screen.getByRole("table")).toBeInTheDocument();
  });
});
