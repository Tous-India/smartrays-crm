import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { message } from "antd";
import LeaveSection from "./LeaveSection";
import useSessionStore from "../../../store/sessionStore";
import * as leaveApi from "../api/leaveApi";
import * as userApi from "../../user/api/userApi";
import * as teamsHook from "../../team/hooks/useTeams";

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
  deleteLeave: vi.fn(),
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

// Only fetched by the Admin filter bar's Team select — a plain empty
// default keeps every other describe block from needing to care about it.
vi.mock("../../user/api/userApi", () => ({
  listUsers: vi.fn(),
}));

vi.mock("../../team/hooks/useTeams", () => ({
  default: vi.fn(() => ({ teams: [] })),
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

// Pending requests render as CARDS for anyone who can act (§B5), so table
// assertions need an already-decided request to have a row at all.
const APPROVED_LEAVE = {
  ...PENDING_LEAVE,
  _id: "leave-approved",
  status: "approved",
};

const DEFAULT_BALANCE = { paidLeaveUsed: 0, paidLeaveLimit: 1, paidLeaveRemaining: 1 };

beforeEach(() => {
  vi.clearAllMocks();
  // The admin filter bar now defaults to a "This Month" date preset (§B4), so
  // "now" is pinned inside the fixtures' own month — otherwise every fixture
  // dated June would be filtered out and every table assertion would fail.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 5, 15, 10, 0, 0));
  leaveApi.listLeave.mockResolvedValue({ data: { data: [PENDING_LEAVE] } });
  leaveApi.getLeaveBalance.mockResolvedValue({ data: { data: DEFAULT_BALANCE } });
  userApi.listUsers.mockResolvedValue({ data: { data: [] } });
  teamsHook.default.mockReturnValue({ teams: [] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("LeaveSection — request flow", () => {
  it("submits a new leave request through POST /leave/request", async () => {
    useSessionStore.setState({
      user: { _id: "emp-1", role: "employee", permissions: { leave: { view: true } } },
      isAuthenticated: true,
      isLoading: false,
    });
    leaveApi.requestLeave.mockResolvedValue({ data: { data: {} } });

    render(<LeaveSection />);
    // "own" is this user's only scope, so no tabs render at all — "Paid"
    // (the Type column) is present regardless.
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

    render(<LeaveSection />);
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

describe("LeaveSection — admin exemption from requesting (§7.5c, 2026-07-31)", () => {
  it("hides the Request Leave button entirely for admin", async () => {
    useSessionStore.setState({
      user: { _id: "admin-1", role: "admin", permissions: {} },
      isAuthenticated: true,
      isLoading: false,
    });

    render(<LeaveSection />);
    await screen.findByText("Paid");

    expect(screen.queryByRole("button", { name: "Request Leave" })).not.toBeInTheDocument();
  });

  it("still shows the Request Leave button for a non-admin", async () => {
    useSessionStore.setState({
      user: { _id: "emp-1", role: "employee", permissions: { leave: { view: true } } },
      isAuthenticated: true,
      isLoading: false,
    });

    render(<LeaveSection />);
    await screen.findByText("Paid");

    expect(screen.getByRole("button", { name: "Request Leave" })).toBeInTheDocument();
  });
});

describe("LeaveSection — role-based tabs (§7.5e, 2026-07-31 — no All tab, no calendar)", () => {
  it("shows no tabs at all for an employee (view only)", async () => {
    useSessionStore.setState({
      user: { _id: "emp-1", role: "employee", permissions: { leave: { view: true } } },
      isAuthenticated: true,
      isLoading: false,
    });

    render(<LeaveSection />);
    await screen.findByText("Paid");

    expect(screen.queryByText("Own")).not.toBeInTheDocument();
    expect(screen.queryByText("Team")).not.toBeInTheDocument();
    expect(screen.queryByText("All")).not.toBeInTheDocument();
  });

  it("shows exactly two tabs — Own and Team — for a manager, never All", async () => {
    useSessionStore.setState({
      user: {
        _id: "mgr-1",
        role: "manager",
        permissions: { leave: { view: true, view_team: true, approve: true, decline: true, mark_unapproved_absence: true, delete: true } },
      },
      isAuthenticated: true,
      isLoading: false,
    });

    render(<LeaveSection />);
    await screen.findByText("Paid");

    expect(screen.getByText("Own")).toBeInTheDocument();
    expect(screen.getByText("Team")).toBeInTheDocument();
    expect(screen.queryByText("All")).not.toBeInTheDocument();
  });

  it("shows no tabs for admin — a single unified view, with the Admin filter bar always present", async () => {
    useSessionStore.setState({
      user: { _id: "admin-1", role: "admin", permissions: {} },
      isAuthenticated: true,
      isLoading: false,
    });

    render(<LeaveSection />);
    await screen.findByText("Paid");

    // Scoped to the Segmented tab control specifically — "Team" also legitimately
    // appears as a column header and as the filter's label (2026-08-05).
    expect(document.querySelector(".ant-segmented")).not.toBeInTheDocument();
    expect(screen.queryByText("Own")).not.toBeInTheDocument();
    expect(screen.queryByText("All")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Employee" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Team" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Status" })).toBeInTheDocument();
  });

  it("never renders a List/Calendar toggle anywhere", async () => {
    useSessionStore.setState({
      user: { _id: "admin-1", role: "admin", permissions: {} },
      isAuthenticated: true,
      isLoading: false,
    });

    leaveApi.listLeave.mockResolvedValue({ data: { data: [APPROVED_LEAVE] } });

    render(<LeaveSection />);
    await screen.findByText("Employee One");

    expect(screen.queryByText("Calendar")).not.toBeInTheDocument();
    expect(screen.queryByText("List")).not.toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
  });
});

describe("LeaveSection — approve/decline/mark-unapproved-absence/delete, permission-gated (§7.5c/§7.5d)", () => {
  it("shows no Actions column at all for a role with none of the four grants", async () => {
    useSessionStore.setState({
      user: { _id: "sales-1", role: "sales_associate", permissions: { leave: { view: true } } },
      isAuthenticated: true,
      isLoading: false,
    });

    render(<LeaveSection />);
    await screen.findByText("Paid");

    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Decline" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark Unapproved Absence" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("shows Approve, Decline, Mark Unapproved Absence, and Delete for a manager holding the default team-scoped grants", async () => {
    useSessionStore.setState({
      user: {
        _id: "mgr-1",
        role: "manager",
        permissions: {
          leave: { view: true, view_team: true, approve: true, decline: true, mark_unapproved_absence: true, delete: true },
        },
      },
      isAuthenticated: true,
      isLoading: false,
    });

    render(<LeaveSection />);
    await userEvent.click(screen.getByText("Team"));
    await screen.findByText("Employee One");

    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Decline" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark Unapproved Absence" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("shows Approve, Mark Unapproved Absence, and Delete actions for an admin", async () => {
    useSessionStore.setState({
      user: { _id: "admin-1", role: "admin", permissions: {} },
      isAuthenticated: true,
      isLoading: false,
    });

    render(<LeaveSection />);
    await screen.findByText("Paid");

    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark Unapproved Absence" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("shows the 2x-deduction consequence directly in the confirm prompt, not a tooltip, before an admin confirms", async () => {
    useSessionStore.setState({
      user: { _id: "admin-1", role: "admin", permissions: {} },
      isAuthenticated: true,
      isLoading: false,
    });

    render(<LeaveSection />);
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

    render(<LeaveSection />);
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

    render(<LeaveSection />);
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

  it("lets an admin delete a leave request, with a confirmation dialog first", async () => {
    useSessionStore.setState({
      user: { _id: "admin-1", role: "admin", permissions: {} },
      isAuthenticated: true,
      isLoading: false,
    });
    leaveApi.deleteLeave.mockResolvedValue({ data: { data: null } });

    render(<LeaveSection />);
    await screen.findByText("Paid");

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("Delete this leave request?")).toBeInTheDocument();
    expect(leaveApi.deleteLeave).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Confirm Delete" }));

    await waitFor(() => {
      expect(leaveApi.deleteLeave).toHaveBeenCalledWith("leave-1");
    });
    expect(message.success).toHaveBeenCalledWith("Leave request deleted");
  });
});

describe("LeaveSection — action failures are surfaced, not swallowed (BUG 9/10, 2026-08-05)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    leaveApi.listLeave.mockResolvedValue({ data: { data: [PENDING_LEAVE] } });
    leaveApi.getLeaveBalance.mockResolvedValue({ data: { data: DEFAULT_BALANCE } });
    userApi.listUsers.mockResolvedValue({ data: { data: [] } });
    teamsHook.default.mockReturnValue({ teams: [] });
    useSessionStore.setState({
      user: { _id: "admin-1", role: "admin", permissions: {} },
      isAuthenticated: true,
      isLoading: false,
    });
  });

  it("shows the backend's message when Approve fails, instead of silently doing nothing", async () => {
    leaveApi.approveLeave.mockRejectedValue({
      response: { status: 409, data: { message: "A single paid leave request cannot exceed 1 day — only one paid leave is provided per month." } },
    });

    render(<LeaveSection />);
    await screen.findByText("Paid");

    await userEvent.click(screen.getByRole("button", { name: "Approve" }));
    await userEvent.click(await screen.findByRole("button", { name: "Confirm Approval" }));

    await waitFor(() => {
      expect(message.error).toHaveBeenCalledWith(
        "A single paid leave request cannot exceed 1 day — only one paid leave is provided per month."
      );
    });
    expect(message.success).not.toHaveBeenCalled();
  });

  it("shows the backend's message when Delete fails", async () => {
    leaveApi.deleteLeave.mockRejectedValue({
      response: { status: 403, data: { message: "You can only act on leave requests from your own direct reports" } },
    });

    render(<LeaveSection />);
    await screen.findByText("Paid");

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await userEvent.click(await screen.findByRole("button", { name: "Confirm Delete" }));

    await waitFor(() => {
      expect(message.error).toHaveBeenCalledWith("You can only act on leave requests from your own direct reports");
    });
    expect(message.success).not.toHaveBeenCalled();
  });

  it("shows the backend's message when Mark Unapproved Absence fails", async () => {
    leaveApi.markUnapprovedAbsence.mockRejectedValue({
      response: { status: 403, data: { message: "You can only act on leave requests from your own direct reports" } },
    });

    render(<LeaveSection />);
    await screen.findByText("Paid");

    await userEvent.click(screen.getByRole("button", { name: "Mark Unapproved Absence" }));
    await userEvent.click(await screen.findByRole("button", { name: "Mark Absence (2x)" }));

    await waitFor(() => {
      expect(message.error).toHaveBeenCalledWith("You can only act on leave requests from your own direct reports");
    });
    expect(message.success).not.toHaveBeenCalled();
  });
});

describe("LeaveSection — a manager gets no actions on their OWN request (BUG 10, 2026-08-05)", () => {
  const MANAGER_OWN_LEAVE = { ...PENDING_LEAVE, _id: "leave-own", employeeId: "mgr-1" };

  beforeEach(() => {
    vi.clearAllMocks();
    leaveApi.getLeaveBalance.mockResolvedValue({ data: { data: DEFAULT_BALANCE } });
    userApi.listUsers.mockResolvedValue({ data: { data: [] } });
    teamsHook.default.mockReturnValue({ teams: [] });
    useSessionStore.setState({
      user: {
        _id: "mgr-1",
        role: "manager",
        permissions: {
          leave: { view: true, view_team: true, approve: true, decline: true, mark_unapproved_absence: true, delete: true },
        },
      },
      isAuthenticated: true,
      isLoading: false,
    });
  });

  it("hides all four actions on the manager's own request — the backend always 403s them", async () => {
    leaveApi.listLeave.mockResolvedValue({ data: { data: [MANAGER_OWN_LEAVE] } });

    render(<LeaveSection />);
    await screen.findByText("Paid");

    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Decline" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark Unapproved Absence" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("still shows the actions on a direct report's request", async () => {
    leaveApi.listLeave.mockResolvedValue({ data: { data: [PENDING_LEAVE] } });

    render(<LeaveSection />);
    await userEvent.click(screen.getByText("Team"));
    await screen.findByText("Employee One");

    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });
});

describe("LeaveSection — Reason column (§7.5f, 2026-08-04 — a real column, not an expandable row)", () => {
  it("shows the Reason directly in the table, with no expand toggle anywhere", async () => {
    useSessionStore.setState({
      user: { _id: "admin-1", role: "admin", permissions: {} },
      isAuthenticated: true,
      isLoading: false,
    });

    render(<LeaveSection />);
    await screen.findByText("Employee One");

    expect(screen.getByText("Family event")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Expand row" })).not.toBeInTheDocument();
  });

  it("shows the Reason column for an employee's own list too, not just Team/Admin scopes", async () => {
    useSessionStore.setState({
      user: { _id: "emp-1", role: "employee", permissions: { leave: { view: true } } },
      isAuthenticated: true,
      isLoading: false,
    });

    render(<LeaveSection />);

    expect(await screen.findByText("Family event")).toBeInTheDocument();
  });
});

describe("LeaveSection — Admin filters (§7.5c/§7.5e, 2026-07-31)", () => {
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
    // Both fixtures are DECIDED here: this block asserts on the TABLE, and a
    // pending request now renders as an approval card instead (§B5).
    leaveApi.listLeave.mockResolvedValue({
      data: { data: [{ ...PENDING_LEAVE, status: "approved" }, OTHER_LEAVE] },
    });
    teamsHook.default.mockReturnValue({
      teams: [
        { _id: "team-1", name: "Sales Team", headManagerId: "mgr-1" },
        { _id: "team-2", name: "Support Team", headManagerId: "mgr-2" },
      ],
    });
    userApi.listUsers.mockResolvedValue({
      data: {
        data: [
          { _id: "emp-1", name: "Employee One", role: "employee", managerId: "mgr-1" },
          { _id: "emp-2", name: "Employee Two", role: "employee", managerId: "mgr-2" },
        ],
      },
    });
  });

  it("the Admin filter bar is always present, immediately — no tab needs clicking first", async () => {
    render(<LeaveSection />);

    expect(await screen.findByRole("combobox", { name: "Employee" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Team" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Status" })).toBeInTheDocument();
  });

  it("shows a Team column resolving each employee to their team (2026-08-05)", async () => {
    render(<LeaveSection />);

    await screen.findByText("Employee One");

    expect(screen.getByRole("columnheader", { name: "Team" })).toBeInTheDocument();
    expect(await within(screen.getByRole("row", { name: /Employee One/ })).findByText("Sales Team")).toBeInTheDocument();
    expect(within(screen.getByRole("row", { name: /Employee Two/ })).getByText("Support Team")).toBeInTheDocument();
  });

  it("falls back to an em dash for an employee in no team", async () => {
    userApi.listUsers.mockResolvedValue({
      data: { data: [{ _id: "emp-1", name: "Employee One", role: "employee", managerId: null }] },
    });
    leaveApi.listLeave.mockResolvedValue({ data: { data: [{ ...PENDING_LEAVE, status: "approved" }] } });

    render(<LeaveSection />);
    await screen.findByText("Employee One");

    expect(within(screen.getByRole("row", { name: /Employee One/ })).getAllByText("—").length).toBeGreaterThan(0);
  });

  it("filters the table down to one employee's requests via the Employee select", async () => {
    render(<LeaveSection />);
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

  it("filters the table down to one real team via the Team select (§7.5e fix — built against the real Team entity)", async () => {
    render(<LeaveSection />);
    await screen.findByText("Employee One");

    await userEvent.click(screen.getByRole("combobox", { name: "Team" }));
    await userEvent.click(await screen.findByTitle("Support Team"));

    expect(await screen.findByText("Employee Two")).toBeInTheDocument();
    expect(screen.queryByText("Employee One")).not.toBeInTheDocument();
  });

  it("filters the table down by Status", async () => {
    leaveApi.listLeave.mockResolvedValue({
      data: { data: [{ ...PENDING_LEAVE, status: "approved" }, { ...OTHER_LEAVE, status: "rejected" }] },
    });

    render(<LeaveSection />);
    await screen.findByText("Employee One");

    await userEvent.click(screen.getByRole("combobox", { name: "Status" }));
    // "rejected" is labelled "Declined" in the filter (§B5).
    await userEvent.click(await screen.findByTitle("Declined"));

    expect(await screen.findByText("Employee Two")).toBeInTheDocument();
    expect(screen.queryByText("Employee One")).not.toBeInTheDocument();
  });

  it("filters by the derived Unapproved Absence option, which is a flag rather than a status (§B5)", async () => {
    leaveApi.listLeave.mockResolvedValue({
      data: {
        data: [
          { ...PENDING_LEAVE, status: "approved", isDoubleDeduction: false },
          { ...OTHER_LEAVE, status: "approved", isDoubleDeduction: true },
        ],
      },
    });

    render(<LeaveSection />);
    await screen.findByText("Employee One");

    await userEvent.click(screen.getByRole("combobox", { name: "Status" }));
    await userEvent.click(await screen.findByTitle("Unapproved Absence"));

    expect(await screen.findByText("Employee Two")).toBeInTheDocument();
    expect(screen.queryByText("Employee One")).not.toBeInTheDocument();
  });
});

describe("LeaveSection — leave balance", () => {
  it("shows the caller's own balance card on the employee-facing view", async () => {
    useSessionStore.setState({
      user: { _id: "emp-1", role: "employee", permissions: { leave: { view: true } } },
      isAuthenticated: true,
      isLoading: false,
    });

    render(<LeaveSection />);

    expect(await screen.findByText("Your Paid Leave Balance This Month")).toBeInTheDocument();
    expect(leaveApi.getLeaveBalance).toHaveBeenCalledWith(undefined);
  });

  it("replaces it with admin queue stats for an admin (§B3) — a personal balance is useless on an approval screen", async () => {
    useSessionStore.setState({
      user: { _id: "admin-1", role: "admin", permissions: {} },
      isAuthenticated: true,
      isLoading: false,
    });

    render(<LeaveSection />);

    expect(await screen.findByText("Pending Requests")).toBeInTheDocument();
    expect(screen.getByText("On Leave Today")).toBeInTheDocument();
    expect(screen.getByText("Upcoming This Week")).toBeInTheDocument();
    expect(screen.getByText("Unapproved Absences")).toBeInTheDocument();
    expect(screen.queryByText("Your Paid Leave Balance This Month")).not.toBeInTheDocument();
  });
});

// BUG 3 regression (2026-08-04) — investigating a live "Team tab shows
// empty" report found the backend scoping itself is correct and already
// covered by a passing test (`scope=team lets a manager see their direct
// reports' requests`, leave.test.js) — the live database's data was the
// actual cause (the sole manager account had zero real direct reports),
// not a code defect. What WAS a real, separate bug found along the way:
// GET /leave's `error` was silently ignored entirely, so a genuine fetch
// failure (a 403 for a scope the caller lost access to, a 500, a network
// error) rendered identically to "this scope genuinely has zero requests"
// — indistinguishable from the outside, which is exactly what made this
// report hard to diagnose in the first place.
describe("LeaveSection — surfaces a fetch error distinctly from an empty list (BUG 3, 2026-08-04)", () => {
  it("shows an error Alert instead of silently rendering an empty table when GET /leave fails", async () => {
    leaveApi.listLeave.mockRejectedValue({ response: { status: 403 } });
    useSessionStore.setState({
      user: { _id: "manager-1", role: "manager", permissions: { leave: { view: true, view_team: true } } },
      isAuthenticated: true,
      isLoading: false,
    });

    render(<LeaveSection />);

    expect(await screen.findByText("Could not load leave requests")).toBeInTheDocument();
    expect(screen.getByText("You don't have permission to view this scope.")).toBeInTheDocument();
    // Must not ALSO render an (empty) table underneath the error — the
    // whole point is one unambiguous state, not both at once.
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("renders the table normally (no error Alert) when the scope genuinely has zero requests", async () => {
    leaveApi.listLeave.mockResolvedValue({ data: { data: [] } });
    useSessionStore.setState({
      user: { _id: "manager-1", role: "manager", permissions: { leave: { view: true, view_team: true } } },
      isAuthenticated: true,
      isLoading: false,
    });

    render(<LeaveSection />);

    await waitFor(() => expect(leaveApi.listLeave).toHaveBeenCalled());
    expect(screen.queryByText("Could not load leave requests")).not.toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
  });
});
