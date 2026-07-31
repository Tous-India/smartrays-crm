import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { message } from "antd";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import UserDetailPage from "./UserDetailPage";
import useSessionStore from "../store/sessionStore";
import * as userApi from "../modules/user/api/userApi";
import * as attendanceApi from "../modules/attendance/api/attendanceApi";
import * as leaveApi from "../modules/leave/api/leaveApi";
import * as leadApi from "../modules/lead/api/leadApi";
import * as permissionApi from "../modules/permission/api/permissionApi";
import * as payrollApi from "../modules/payroll/api/payrollApi";

vi.mock("antd", async (importOriginal) => {
  const actual = await importOriginal();
  // Components read `message` via `App.useApp()` (§7.28 message-rendering
  // fix — the static import silently fails to render under React 19), not
  // the static export, so the mock has to intercept the hook too.
  const mockMessage = { success: vi.fn(), error: vi.fn() };
  const mockModal = { confirm: (config) => config.onOk() };
  actual.App.useApp = () => ({ message: mockMessage, modal: mockModal });
  return { ...actual, message: mockMessage };
});

vi.mock("../modules/user/api/userApi", () => ({
  getUser: vi.fn(),
  updateUser: vi.fn(),
  createUser: vi.fn(),
  deactivateUser: vi.fn(),
  reactivateUser: vi.fn(),
  deleteUser: vi.fn(),
  getDeactivationImpact: vi.fn(),
}));

vi.mock("../modules/attendance/api/attendanceApi", () => ({
  getMyAttendance: vi.fn(),
  getTeamAttendance: vi.fn(),
}));

vi.mock("../modules/leave/api/leaveApi", () => ({
  getLeaveBalance: vi.fn(),
}));

vi.mock("../modules/lead/api/leadApi", () => ({
  listLeads: vi.fn(),
}));

vi.mock("../modules/permission/api/permissionApi", () => ({
  getPermissionRegistry: vi.fn(),
  getUserPermissions: vi.fn(),
  getRoleTemplate: vi.fn(),
}));

vi.mock("../modules/payroll/api/payrollApi", () => ({
  listPayroll: vi.fn(),
}));

const SAMPLE_TEAMS = [{ _id: "team-1", name: "Sale Team", type: "sales", headManagerId: "manager-1", memberCount: 2 }];

vi.mock("../modules/team/hooks/useTeams", () => ({
  useTeams: () => ({ teams: SAMPLE_TEAMS, isLoading: false, refetch: vi.fn() }),
  default: () => ({ teams: SAMPLE_TEAMS, isLoading: false, refetch: vi.fn() }),
}));

vi.mock("../hooks/useUserDirectory", () => ({
  useUserDirectory: () => ({
    users: [
      { _id: "manager-1", name: "Manager One", role: "manager" },
      { _id: "sales-1", name: "Sales One", role: "sales_associate" },
    ],
    isLoading: false,
  }),
  default: () => ({
    users: [
      { _id: "manager-1", name: "Manager One", role: "manager" },
      { _id: "sales-1", name: "Sales One", role: "sales_associate" },
    ],
    isLoading: false,
  }),
}));

const ADMIN_USER = { _id: "admin-1", name: "Admin", role: "admin", permissions: {} };

const SALES_USER = {
  _id: "sales-1",
  name: "Sales One",
  email: "sales1@test.local",
  phone: "555-0001",
  role: "sales_associate",
  isActive: true,
  managerId: "manager-1",
  createdAt: "2026-01-15T00:00:00.000Z",
};

function renderDetailPage(userId = "sales-1") {
  return render(
    <MemoryRouter initialEntries={[`/settings/users/${userId}`]}>
      <Routes>
        <Route path="/settings/users/:id" element={<UserDetailPage />} />
        <Route path="/settings/users" element={<div>User Management List</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("UserDetailPage (§7.32)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSessionStore.setState({ user: ADMIN_USER, isAuthenticated: true, isLoading: false });

    userApi.getUser.mockResolvedValue({ data: { data: SALES_USER } });
    attendanceApi.getTeamAttendance.mockResolvedValue({ data: { data: [] } });
    attendanceApi.getMyAttendance.mockResolvedValue({ data: { data: [] } });
    leaveApi.getLeaveBalance.mockResolvedValue({
      data: { data: { paidLeaveUsed: 1, paidLeaveLimit: 12, paidLeaveRemaining: 11 } },
    });
    leadApi.listLeads.mockResolvedValue({ data: { data: [] } });
    permissionApi.getPermissionRegistry.mockResolvedValue({
      data: { data: { leads: ["view", "create"] } },
    });
    permissionApi.getUserPermissions.mockResolvedValue({ data: { data: { leads: { view: true } } } });
    permissionApi.getRoleTemplate.mockResolvedValue({
      data: { data: { role: "sales_associate", permissions: {} } },
    });
    payrollApi.listPayroll.mockResolvedValue({ data: { data: [] } });
  });

  it("renders the header, basic info, and every section with real data", async () => {
    renderDetailPage();

    expect(await screen.findByText("Sales One")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText(/sales1@test.local/)).toBeInTheDocument();
    expect(screen.getByText(/Manager One/)).toBeInTheDocument();
    expect(await screen.findByText("Sale Team")).toBeInTheDocument();
  });

  it("shows the Owned Leads card for a sales_associate", async () => {
    renderDetailPage();
    await screen.findByText("Sales One");

    expect(await screen.findByText("Owned Leads")).toBeInTheDocument();
    expect(leadApi.listLeads).toHaveBeenCalledWith({ owner: "sales-1" });
  });

  it("hides the Owned Leads card for an employee", async () => {
    userApi.getUser.mockResolvedValue({ data: { data: { ...SALES_USER, role: "employee" } } });
    renderDetailPage();
    await screen.findByText("Sales One");

    expect(screen.queryByText("Owned Leads")).not.toBeInTheDocument();
  });

  it("shows Payroll History for an admin viewer", async () => {
    renderDetailPage();
    await screen.findByText("Sales One");

    expect(await screen.findByText("Payroll History")).toBeInTheDocument();
  });

  it("hides Payroll History for a non-admin viewer, even on someone else's page", async () => {
    useSessionStore.setState({
      user: { _id: "manager-1", name: "Manager One", role: "manager", permissions: {} },
      isAuthenticated: true,
      isLoading: false,
    });
    renderDetailPage();
    await screen.findByText("Sales One");

    expect(screen.queryByText("Payroll History")).not.toBeInTheDocument();
    expect(payrollApi.listPayroll).not.toHaveBeenCalled();
  });

  it("summarizes permission overrides against the role default, not the full matrix", async () => {
    permissionApi.getUserPermissions.mockResolvedValue({
      data: { data: { leads: { view: true, create: true } } },
    });
    permissionApi.getRoleTemplate.mockResolvedValue({
      data: { data: { role: "sales_associate", permissions: { leads: { view: true } } } },
    });
    renderDetailPage();
    await screen.findByText("Sales One");

    // "view" matches the default (not shown as an override); "create" was
    // granted beyond the default, so it IS shown.
    expect(await screen.findByText(/leads.create: Granted/)).toBeInTheDocument();
    expect(screen.queryByText(/leads.view/)).not.toBeInTheDocument();
  });

  it("links the Permissions card's 'Manage overrides' to the deep-linked Permissions page", async () => {
    renderDetailPage();
    await screen.findByText("Sales One");

    const link = await screen.findByRole("link", { name: /Manage overrides/ });
    expect(link).toHaveAttribute("href", "/settings/permissions?userId=sales-1");
  });

  it("one section's fetch failing doesn't blank the rest of the page", async () => {
    leaveApi.getLeaveBalance.mockRejectedValue(new Error("network error"));
    renderDetailPage();

    expect(await screen.findByText("Sales One")).toBeInTheDocument();
    expect(await screen.findByText("Owned Leads")).toBeInTheDocument();
    expect(await screen.findByText("Payroll History")).toBeInTheDocument();
  });

  it("shows a 404 result for a nonexistent user", async () => {
    userApi.getUser.mockRejectedValue({ response: { status: 404 } });
    renderDetailPage("nonexistent");

    expect(await screen.findByText("User not found")).toBeInTheDocument();
  });

  it("reuses the exact Edit action to open the same UserFormModal the list page uses", async () => {
    renderDetailPage();
    await screen.findByText("Sales One");

    await userEvent.click(screen.getByRole("button", { name: "Edit" }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("deactivating with nothing to reassign calls deactivateUser directly", async () => {
    userApi.getDeactivationImpact.mockResolvedValue({
      data: { data: { teamsLed: [], ownedLeadsCount: 0 } },
    });
    userApi.deactivateUser.mockResolvedValue({ data: {} });
    renderDetailPage();
    await screen.findByText("Sales One");

    await userEvent.click(screen.getByRole("button", { name: "Deactivate" }));

    await waitFor(() => {
      expect(userApi.deactivateUser).toHaveBeenCalledWith("sales-1", undefined);
    });
    expect(message.success).toHaveBeenCalledWith("Sales One deactivated");
  });

  it("navigates back to the User Management list after a successful delete", async () => {
    userApi.getUser.mockResolvedValue({ data: { data: { ...SALES_USER, isActive: false } } });
    userApi.deleteUser.mockResolvedValue({ data: {} });
    renderDetailPage();
    await screen.findByText("Sales One");

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("dialog", { name: "Delete User" });
    await userEvent.type(within(dialog).getByLabelText("Reason for deletion"), "Left the company");
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(await screen.findByText("User Management List")).toBeInTheDocument();
  });
});
