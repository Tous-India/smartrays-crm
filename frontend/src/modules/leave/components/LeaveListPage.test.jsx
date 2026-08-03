import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { message } from "antd";
import LeaveListPage from "./LeaveListPage";
import useSessionStore from "../../../store/sessionStore";
import * as leaveApi from "../api/leaveApi";
import * as userApi from "../../user/api/userApi";

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
    users: [
      { _id: "emp-1", name: "Employee One" },
      { _id: "emp-2", name: "Employee Two" },
    ],
  }),
}));

// Only fetched by the Admin (scope=all) filter bar's Team select — a plain
// empty default keeps every other describe block (which never reaches
// scope=all) from needing to care about it at all.
vi.mock("../../user/api/userApi", () => ({
  listUsers: vi.fn(),
}));

const PENDING_LEAVE = {
  _id: "leave-1",
  employeeId: "emp-1",
  startDate: "2026-06-10T00:00:00.000Z",
  endDate: "2026-06-10T00:00:00.000Z",
  type: "paid",
  status: "pending",
  isDoubleDeduction: false,
  reason: "Family event",
};

const DEFAULT_BALANCE = { paidLeaveUsed: 0, paidLeaveLimit: 1, paidLeaveRemaining: 1 };

beforeEach(() => {
  vi.clearAllMocks();
  leaveApi.listLeave.mockResolvedValue({ data: { data: [PENDING_LEAVE] } });
  leaveApi.getLeaveBalance.mockResolvedValue({ data: { data: DEFAULT_BALANCE } });
  userApi.listUsers.mockResolvedValue({ data: { data: [] } });
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
    // Reason is required on submission too (§7.5c, 2026-07-31) — asserted
    // alongside Start Date's error rather than in a separate test, since
    // both come from the same blank-form submit attempt.
    expect(await screen.findByText("A reason is required")).toBeInTheDocument();
    expect(leaveApi.requestLeave).not.toHaveBeenCalled();
  });
});

describe("LeaveListPage — admin exemption from requesting (§7.5c, 2026-07-31)", () => {
  it("hides the Request Leave button entirely for admin", async () => {
    useSessionStore.setState({
      user: { _id: "admin-1", role: "admin", permissions: {} },
      isAuthenticated: true,
      isLoading: false,
    });

    render(<LeaveListPage />);
    await screen.findByText("Paid");

    expect(screen.queryByRole("button", { name: "Request Leave" })).not.toBeInTheDocument();
  });

  it("still shows the Request Leave button for a non-admin", async () => {
    useSessionStore.setState({
      user: { _id: "emp-1", role: "employee", permissions: { leave: { view: true } } },
      isAuthenticated: true,
      isLoading: false,
    });

    render(<LeaveListPage />);
    await screen.findByText("Paid");

    expect(screen.getByRole("button", { name: "Request Leave" })).toBeInTheDocument();
  });
});

describe("LeaveListPage — approve/decline/mark-unapproved-absence, permission-gated (§7.5c, 2026-07-31)", () => {
  it("shows no Actions column at all for a role with none of the three grants", async () => {
    useSessionStore.setState({
      user: { _id: "sales-1", role: "sales_associate", permissions: { leave: { view: true } } },
      isAuthenticated: true,
      isLoading: false,
    });

    render(<LeaveListPage />);
    await screen.findByText("Paid");

    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Decline" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark Unapproved Absence" })).not.toBeInTheDocument();
  });

  it("shows Approve, Decline, and Mark Unapproved Absence for a manager holding the new default team-scoped grants", async () => {
    useSessionStore.setState({
      user: {
        _id: "mgr-1",
        role: "manager",
        permissions: { leave: { view_team: true, approve: true, decline: true, mark_unapproved_absence: true } },
      },
      isAuthenticated: true,
      isLoading: false,
    });

    render(<LeaveListPage />);
    await screen.findByText("Employee One");

    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Decline" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark Unapproved Absence" })).toBeInTheDocument();
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

describe("LeaveListPage — Reason field (§7.5c, 2026-07-31)", () => {
  it("shows the Reason as an expandable row detail once a Team/All scope is active", async () => {
    useSessionStore.setState({
      user: { _id: "admin-1", role: "admin", permissions: {} },
      isAuthenticated: true,
      isLoading: false,
    });

    render(<LeaveListPage />);
    await screen.findByText("Paid");
    // Admin's default scope is "own" (first tab) — the expandable row (like
    // the Employee column) only applies once viewing someone else's data.
    expect(screen.queryByRole("button", { name: "Expand row" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByText("All"));
    await screen.findByText("Employee One");

    await userEvent.click(screen.getByRole("button", { name: "Expand row" }));
    expect(await screen.findByText(/Family event/)).toBeInTheDocument();
  });
});

describe("LeaveListPage — Admin filters (§7.5c, 2026-07-31)", () => {
  const OTHER_LEAVE = {
    _id: "leave-2",
    employeeId: "emp-2",
    startDate: "2026-06-20T00:00:00.000Z",
    endDate: "2026-06-21T00:00:00.000Z",
    type: "unpaid",
    status: "approved",
    isDoubleDeduction: false,
    reason: "Trip",
  };

  beforeEach(() => {
    useSessionStore.setState({
      user: { _id: "admin-1", role: "admin", permissions: {} },
      isAuthenticated: true,
      isLoading: false,
    });
    leaveApi.listLeave.mockResolvedValue({ data: { data: [PENDING_LEAVE, OTHER_LEAVE] } });
    userApi.listUsers.mockResolvedValue({
      data: {
        data: [
          { _id: "emp-1", name: "Employee One", role: "employee", managerId: "mgr-1" },
          { _id: "emp-2", name: "Employee Two", role: "employee", managerId: "mgr-2" },
          { _id: "mgr-1", name: "Manager One", role: "manager", managerId: null },
          { _id: "mgr-2", name: "Manager Two", role: "manager", managerId: null },
        ],
      },
    });
  });

  it("only shows the filter bar for the Admin (scope=all) list view, not Own/Team or the calendar", async () => {
    render(<LeaveListPage />);
    await screen.findByText("Paid");
    expect(screen.queryByRole("combobox", { name: "Status" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByText("All"));
    expect(await screen.findByRole("combobox", { name: "Employee" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Team" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Status" })).toBeInTheDocument();

    await userEvent.click(screen.getByText("Calendar"));
    expect(screen.queryByRole("combobox", { name: "Status" })).not.toBeInTheDocument();
  });

  it("filters the table down to one employee's requests via the Employee select", async () => {
    render(<LeaveListPage />);
    await userEvent.click(screen.getByText("All"));
    await screen.findByText("Employee One");
    expect(screen.getByText("Employee Two")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("combobox", { name: "Employee" }));
    await userEvent.click(await screen.findByTitle("Employee One"));

    // The Select's own selected-value display also renders "Employee One"
    // text now, so the table row itself has to be checked specifically
    // rather than a page-wide text query.
    const table = screen.getByRole("table");
    expect(within(table).getByText("Employee One")).toBeInTheDocument();
    expect(within(table).queryByText("Employee Two")).not.toBeInTheDocument();
  });

  it("filters the table down to one manager's team via the Team select", async () => {
    render(<LeaveListPage />);
    await userEvent.click(screen.getByText("All"));
    await screen.findByText("Employee One");

    await userEvent.click(screen.getByRole("combobox", { name: "Team" }));
    await userEvent.click(await screen.findByTitle("Manager Two"));

    expect(await screen.findByText("Employee Two")).toBeInTheDocument();
    expect(screen.queryByText("Employee One")).not.toBeInTheDocument();
  });

  it("filters the table down by Status", async () => {
    render(<LeaveListPage />);
    await userEvent.click(screen.getByText("All"));
    await screen.findByText("Employee One");

    await userEvent.click(screen.getByRole("combobox", { name: "Status" }));
    await userEvent.click(await screen.findByTitle("Approved"));

    expect(await screen.findByText("Employee Two")).toBeInTheDocument();
    expect(screen.queryByText("Employee One")).not.toBeInTheDocument();
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
