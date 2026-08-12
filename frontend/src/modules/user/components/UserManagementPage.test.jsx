import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { message } from "antd";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import UserManagementPage from "./UserManagementPage";
import useSessionStore from "../../../store/sessionStore";
import * as userApi from "../api/userApi";

// Same pattern as CustomersListPage.test.jsx — antd's `message` toast is
// portal-rendered outside RTL's reach under jsdom, so the mock function call
// is asserted directly instead of DOM text.
vi.mock("antd", async (importOriginal) => {
  const actual = await importOriginal();
  // Components read `message` via `App.useApp()` (§7.28 message-rendering
  // fix — the static import silently fails to render under React 19), not
  // the static export, so the mock has to intercept the hook too.
  const mockMessage = { success: vi.fn(), error: vi.fn() };
  // `modal.confirm` (§7.31 — used when nothing needs reassignment) invokes
  // its own `onOk` synchronously here rather than rendering a real AntD
  // Modal, matching how this test suite already treats `message` — the
  // point under test is "was the right callback wired up," not AntD's own
  // modal-rendering internals.
  const mockModal = { confirm: (config) => config.onOk() };
  actual.App.useApp = () => ({ message: mockMessage, modal: mockModal });
  return { ...actual, message: mockMessage };
});

vi.mock("../api/userApi", () => ({
  listUsers: vi.fn(),
  updateUser: vi.fn(),
  deactivateUser: vi.fn(),
  reactivateUser: vi.fn(),
  adminResetPassword: vi.fn(),
  createUser: vi.fn(),
  deleteUser: vi.fn(),
  getDeactivationImpact: vi.fn(),
}));

// A `vi.fn()`, not a plain arrow function — the reassignment-modal tests
// (§7.31) need real user options to pick from, unlike every other test in
// this file, which doesn't care what this hook returns. `mockReturnValue`
// per-test overrides the default empty list below.
const mockUseUserDirectory = vi.fn(() => ({ users: [], isLoading: false }));
vi.mock("../../../hooks/useUserDirectory", () => ({
  useUserDirectory: (...args) => mockUseUserDirectory(...args),
  default: (...args) => mockUseUserDirectory(...args),
}));

const SAMPLE_TEAMS = [
  { _id: "team-1", name: "North Sales Team", type: "Sales", headManagerId: "user-1" },
  { _id: "team-2", name: "Install Crew", type: null, headManagerId: "user-3" },
];

vi.mock("../../team/hooks/useTeams", () => ({
  useTeams: () => ({ teams: SAMPLE_TEAMS, isLoading: false, refetch: vi.fn() }),
  default: () => ({ teams: SAMPLE_TEAMS, isLoading: false, refetch: vi.fn() }),
}));

const ADMIN_USER = { _id: "admin-1", name: "Admin", role: "admin", permissions: {} };

const SAMPLE_USERS = [
  {
    _id: "user-1",
    name: "Manager One",
    email: "manager1@test.local",
    role: "manager",
    isActive: true,
    managerId: null,
  },
  {
    _id: "user-2",
    name: "Sales One",
    email: "sales1@test.local",
    role: "sales_associate",
    isActive: false,
    managerId: "user-1",
  },
];

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/settings/users"]}>
      <UserManagementPage />
    </MemoryRouter>
  );
}

describe("UserManagementPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSessionStore.setState({ user: ADMIN_USER, isAuthenticated: true, isLoading: false });
    userApi.listUsers.mockResolvedValue({ data: { data: SAMPLE_USERS } });
    userApi.getDeactivationImpact.mockResolvedValue({
      data: { data: { teamsLed: [], ownedLeadsCount: 0 } },
    });
    mockUseUserDirectory.mockReturnValue({ users: [], isLoading: false });
  });

  it("renders the roster with role/status/manager columns", async () => {
    renderPage();

    expect((await screen.findAllByText("Manager One")).length).toBeGreaterThan(0);
    expect(screen.getByText("Sales One")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Inactive")).toBeInTheDocument();
    // Sales One's manager column resolves to Manager One's name.
    const salesRow = screen.getByText("Sales One").closest("tr");
    expect(within(salesRow).getByText("Manager One")).toBeInTheDocument();
  });

  it("navigates to the User Detail page when a row is clicked (§7.32)", async () => {
    render(
      <MemoryRouter initialEntries={["/settings/users"]}>
        <Routes>
          <Route path="/settings/users" element={<UserManagementPage />} />
          <Route path="/settings/users/:id" element={<div>User Detail Page</div>} />
        </Routes>
      </MemoryRouter>
    );
    await screen.findAllByText("Manager One");

    const managerRow = document.querySelector('tr[data-row-key="user-1"]');
    await userEvent.click(within(managerRow).getByText("Manager One"));

    expect(await screen.findByText("User Detail Page")).toBeInTheDocument();
  });

  it("does not navigate when an action button inside the row is clicked (§7.32)", async () => {
    render(
      <MemoryRouter initialEntries={["/settings/users"]}>
        <Routes>
          <Route path="/settings/users" element={<UserManagementPage />} />
          <Route path="/settings/users/:id" element={<div>User Detail Page</div>} />
        </Routes>
      </MemoryRouter>
    );
    await screen.findAllByText("Manager One");

    const managerRow = document.querySelector('tr[data-row-key="user-1"]');
    await userEvent.click(within(managerRow).getByRole("button", { name: "Edit" }));

    expect(screen.queryByText("User Detail Page")).not.toBeInTheDocument();
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("shows a New User button for admin and opens the create form", async () => {
    renderPage();
    await screen.findAllByText("Manager One");

    await userEvent.click(screen.getByRole("button", { name: "New User" }));

    expect(screen.getByRole("dialog", { name: "New User" })).toBeInTheDocument();
  });

  describe("Deactivate (§7.31, 2026-07-31 — guided reassignment, reverses the earlier hard-block guard §7.28)", () => {
    it("checks impact first, and deactivates directly (no reassignment modal) when nothing needs reassigning", async () => {
      userApi.deactivateUser.mockResolvedValue({ data: {} });
      const { container } = renderPage();
      await screen.findAllByText("Manager One");

      const managerRow = container.querySelector('tr[data-row-key="user-1"]');
      await userEvent.click(within(managerRow).getByRole("button", { name: "Deactivate" }));

      await waitFor(() => {
        expect(userApi.getDeactivationImpact).toHaveBeenCalledWith("user-1");
      });
      await waitFor(() => {
        expect(userApi.deactivateUser).toHaveBeenCalledWith("user-1", undefined);
      });
      expect(message.success).toHaveBeenCalledWith("Manager One deactivated");
      expect(screen.queryByRole("dialog", { name: "Reassign Before Deactivating" })).not.toBeInTheDocument();
    });

    it("opens the reassignment modal instead of deactivating directly when the person leads a team", async () => {
      userApi.getDeactivationImpact.mockResolvedValue({
        data: {
          data: {
            teamsLed: [{ _id: "team-1", name: "North Sales Team", memberCount: 3 }],
            ownedLeadsCount: 0,
          },
        },
      });
      const { container } = renderPage();
      await screen.findAllByText("Manager One");

      const managerRow = container.querySelector('tr[data-row-key="user-1"]');
      await userEvent.click(within(managerRow).getByRole("button", { name: "Deactivate" }));

      const dialog = await screen.findByRole("dialog", { name: "Reassign Before Deactivating" });
      expect(within(dialog).getByText(/North Sales Team/)).toBeInTheDocument();
      expect(userApi.deactivateUser).not.toHaveBeenCalled();
    });

    it("disables submission until the new team head is picked, then submits the reassignment", async () => {
      // A second manager, distinct from Manager One (the one being
      // deactivated) — the modal excludes the person being deactivated
      // from their own replacement-head options.
      mockUseUserDirectory.mockReturnValue({
        users: [
          { _id: "user-1", name: "Manager One", role: "manager" },
          { _id: "user-3", name: "Manager Two", role: "manager" },
        ],
        isLoading: false,
      });
      userApi.getDeactivationImpact.mockResolvedValue({
        data: {
          data: {
            teamsLed: [{ _id: "team-1", name: "North Sales Team", memberCount: 3 }],
            ownedLeadsCount: 0,
          },
        },
      });
      userApi.deactivateUser.mockResolvedValue({ data: {} });
      const { container } = renderPage();
      await screen.findAllByText("Manager One");

      const managerRow = container.querySelector('tr[data-row-key="user-1"]');
      await userEvent.click(within(managerRow).getByRole("button", { name: "Deactivate" }));

      const dialog = await screen.findByRole("dialog", { name: "Reassign Before Deactivating" });
      await userEvent.click(within(dialog).getByRole("button", { name: "Deactivate" }));
      // Required field left empty — rejected client-side, never even calls the API.
      expect(userApi.deactivateUser).not.toHaveBeenCalled();

      fireEvent.mouseDown(within(dialog).getByText("Select a manager or admin"));
      await userEvent.click(await screen.findByText("Manager Two"));
      await userEvent.click(within(dialog).getByRole("button", { name: "Deactivate" }));

      await waitFor(() => {
        expect(userApi.deactivateUser).toHaveBeenCalledWith("user-1", {
          reassignTeamsTo: { "team-1": "user-3" },
          reassignLeadsTo: undefined,
        });
      });
      expect(message.success).toHaveBeenCalledWith("Manager One deactivated");
    });

    it("also shows a lead-owner picker when the person owns active leads, in addition to any team pickers", async () => {
      userApi.getDeactivationImpact.mockResolvedValue({
        data: { data: { teamsLed: [], ownedLeadsCount: 4 } },
      });
      const { container } = renderPage();
      await screen.findAllByText("Manager One");

      const managerRow = container.querySelector('tr[data-row-key="user-1"]');
      await userEvent.click(within(managerRow).getByRole("button", { name: "Deactivate" }));

      const dialog = await screen.findByRole("dialog", { name: "Reassign Before Deactivating" });
      expect(within(dialog).getByText(/Reassign 4 active lead\(s\) to/)).toBeInTheDocument();
    });

    it("shows both a team-head picker AND a lead-owner picker when the person has both", async () => {
      mockUseUserDirectory.mockReturnValue({
        users: [
          { _id: "user-1", name: "Manager One", role: "manager" },
          { _id: "user-3", name: "Manager Two", role: "manager" },
        ],
        isLoading: false,
      });
      userApi.getDeactivationImpact.mockResolvedValue({
        data: {
          data: {
            teamsLed: [{ _id: "team-1", name: "North Sales Team", memberCount: 3 }],
            ownedLeadsCount: 2,
          },
        },
      });
      const { container } = renderPage();
      await screen.findAllByText("Manager One");

      const managerRow = container.querySelector('tr[data-row-key="user-1"]');
      await userEvent.click(within(managerRow).getByRole("button", { name: "Deactivate" }));

      const dialog = await screen.findByRole("dialog", { name: "Reassign Before Deactivating" });
      expect(within(dialog).getByText(/North Sales Team/)).toBeInTheDocument();
      expect(within(dialog).getByText(/Reassign 2 active lead\(s\) to/)).toBeInTheDocument();

      // Submitting with only the team head filled in — lead owner still
      // required — is rejected client-side.
      fireEvent.mouseDown(within(dialog).getByText("Select a manager or admin"));
      await userEvent.click(await screen.findByText("Manager Two"));
      await userEvent.click(within(dialog).getByRole("button", { name: "Deactivate" }));
      expect(userApi.deactivateUser).not.toHaveBeenCalled();
    });

    it("shows the backend's exact rejection message if deactivation still fails after reassignment (e.g. a race)", async () => {
      mockUseUserDirectory.mockReturnValue({
        users: [
          { _id: "user-1", name: "Manager One", role: "manager" },
          { _id: "user-3", name: "Manager Two", role: "manager" },
        ],
        isLoading: false,
      });
      userApi.getDeactivationImpact.mockResolvedValue({
        data: {
          data: {
            teamsLed: [{ _id: "team-1", name: "North Sales Team", memberCount: 3 }],
            ownedLeadsCount: 0,
          },
        },
      });
      userApi.deactivateUser.mockRejectedValue({
        response: {
          data: {
            message: "Cannot deactivate: this person leads the following team(s) needing a new head: Other Team.",
          },
        },
      });
      const { container } = renderPage();
      await screen.findAllByText("Manager One");

      const managerRow = container.querySelector('tr[data-row-key="user-1"]');
      await userEvent.click(within(managerRow).getByRole("button", { name: "Deactivate" }));

      const dialog = await screen.findByRole("dialog", { name: "Reassign Before Deactivating" });
      fireEvent.mouseDown(within(dialog).getByText("Select a manager or admin"));
      await userEvent.click(await screen.findByText("Manager Two"));
      await userEvent.click(within(dialog).getByRole("button", { name: "Deactivate" }));

      await waitFor(() => {
        expect(message.error).toHaveBeenCalledWith(
          "Cannot deactivate: this person leads the following team(s) needing a new head: Other Team."
        );
      });
      expect(message.success).not.toHaveBeenCalled();
      // Stays open on failure, not silently dismissed.
      expect(screen.getByRole("dialog", { name: "Reassign Before Deactivating" })).toBeInTheDocument();
    });
  });

  it("reactivates an inactive user", async () => {
    userApi.reactivateUser.mockResolvedValue({ data: {} });
    renderPage();
    await screen.findByText("Sales One");

    const salesRow = screen.getByText("Sales One").closest("tr");
    await userEvent.click(within(salesRow).getByRole("button", { name: "Reactivate" }));

    await waitFor(() => {
      expect(userApi.reactivateUser).toHaveBeenCalledWith("user-2");
    });
    expect(message.success).toHaveBeenCalledWith("Sales One reactivated");
  });

  describe("Delete (§7.28 guarded hard-delete, 2026-07-30)", () => {
    it("only shows the Delete icon for an already-Inactive user, never an Active one", async () => {
      const { container } = renderPage();
      await screen.findAllByText("Manager One");

      const managerRow = container.querySelector('tr[data-row-key="user-1"]');
      const salesRow = container.querySelector('tr[data-row-key="user-2"]');

      expect(within(managerRow).queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
      expect(within(salesRow).getByRole("button", { name: "Delete" })).toBeInTheDocument();
    });

    it("opens a confirmation modal requiring a reason, and does not call deleteUser until one is provided", async () => {
      renderPage();
      await screen.findByText("Sales One");

      const salesRow = screen.getByText("Sales One").closest("tr");
      await userEvent.click(within(salesRow).getByRole("button", { name: "Delete" }));

      const dialog = await screen.findByRole("dialog", { name: "Delete User" });
      expect(
        within(dialog).getByText(
          "This permanently deletes Sales One. Their name will no longer resolve in past records (leads, attendance, payments, etc.) — this cannot be undone."
        )
      ).toBeInTheDocument();

      await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

      expect(userApi.deleteUser).not.toHaveBeenCalled();
      expect(await within(dialog).findByText("A reason is required to permanently delete a user")).toBeInTheDocument();
    });

    it("deletes the user once a reason is supplied, and removes them from the list", async () => {
      userApi.deleteUser.mockResolvedValue({ data: {} });
      renderPage();
      await screen.findByText("Sales One");

      // The post-delete refetch() call resolves with this trimmed list — set
      // up before the delete click so it's already in place by the time the
      // component's own refetch() actually fires.
      userApi.listUsers.mockResolvedValue({ data: { data: [SAMPLE_USERS[0]] } });

      const salesRow = screen.getByText("Sales One").closest("tr");
      await userEvent.click(within(salesRow).getByRole("button", { name: "Delete" }));

      const dialog = await screen.findByRole("dialog", { name: "Delete User" });
      await userEvent.type(within(dialog).getByLabelText("Reason for deletion"), "Left the company");
      await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

      await waitFor(() => {
        expect(userApi.deleteUser).toHaveBeenCalledWith("user-2", "Left the company");
      });
      expect(message.success).toHaveBeenCalledWith("Sales One permanently deleted");

      await waitFor(() => {
        expect(screen.queryByText("Sales One")).not.toBeInTheDocument();
      });
    });
  });

  it("opens the admin reset-password modal and shows the generated temp password", async () => {
    userApi.adminResetPassword.mockResolvedValue({ data: { data: { tempPassword: "Temp1234abc" } } });
    const { container } = renderPage();
    await screen.findAllByText("Manager One");

    const managerRow = container.querySelector('tr[data-row-key="user-1"]');
    await userEvent.click(within(managerRow).getByRole("button", { name: "Reset Password" }));
    await userEvent.click(screen.getByRole("button", { name: "Reset password" }));

    expect(await screen.findByTestId("admin-reset-result")).toHaveTextContent("Temp1234abc");
    expect(userApi.adminResetPassword).toHaveBeenCalledWith("user-1", { newPassword: undefined });
  });

  it("hides admin-only actions for a non-admin manager", async () => {
    useSessionStore.setState({
      user: { _id: "user-1", name: "Manager One", role: "manager", permissions: {} },
      isAuthenticated: true,
      isLoading: false,
    });
    renderPage();
    await screen.findAllByText("Manager One");

    expect(screen.queryByRole("button", { name: "New User" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reset Password" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Deactivate" })).not.toBeInTheDocument();
  });

  describe("Filters (§7.28)", () => {
    it("refetches with the selected role", async () => {
      renderPage();
      await screen.findAllByText("Manager One");

      fireEvent.mouseDown(screen.getByText("All Roles"));
      await userEvent.click(await screen.findByTitle("Manager"));

      await waitFor(() => {
        expect(userApi.listUsers).toHaveBeenLastCalledWith(
          expect.objectContaining({ role: "manager" })
        );
      });
    });

    it("refetches with the selected department (teamId)", async () => {
      renderPage();
      await screen.findAllByText("Manager One");

      fireEvent.mouseDown(screen.getByText("All Departments"));
      await userEvent.click(await screen.findByTitle("North Sales Team"));

      await waitFor(() => {
        expect(userApi.listUsers).toHaveBeenLastCalledWith(
          expect.objectContaining({ teamId: "team-1" })
        );
      });
    });

    it("refetches with the selected active/inactive status", async () => {
      renderPage();
      await screen.findAllByText("Manager One");

      fireEvent.mouseDown(screen.getByText("Active or Inactive"));
      await userEvent.click(await screen.findByTitle("Inactive"));

      await waitFor(() => {
        expect(userApi.listUsers).toHaveBeenLastCalledWith(
          expect.objectContaining({ isActive: "false" })
        );
      });
    });

    it("combines multiple filters (AND logic)", async () => {
      renderPage();
      await screen.findAllByText("Manager One");

      fireEvent.mouseDown(screen.getByText("All Roles"));
      await userEvent.click(await screen.findByTitle("Manager"));

      fireEvent.mouseDown(screen.getByText("Active or Inactive"));
      await userEvent.click(await screen.findByTitle("Active"));

      await waitFor(() => {
        expect(userApi.listUsers).toHaveBeenLastCalledWith(
          expect.objectContaining({ role: "manager", isActive: "true" })
        );
      });
    });
  });

  describe("New User form (reworked 2026-07-30)", () => {
    it("shows the compact 4-row layout with Name/Email/Phone/Password/Role/Department/Base Salary", async () => {
      renderPage();
      await screen.findAllByText("Manager One");

      await userEvent.click(screen.getByRole("button", { name: "New User" }));
      const dialog = await screen.findByRole("dialog", { name: "New User" });

      expect(within(dialog).getByLabelText("Name")).toBeInTheDocument();
      expect(within(dialog).getByLabelText("Email")).toBeInTheDocument();
      expect(within(dialog).getByLabelText("Phone")).toBeInTheDocument();
      expect(within(dialog).getByLabelText("Password")).toBeInTheDocument();
      expect(within(dialog).getByLabelText("Role")).toBeInTheDocument();
      expect(within(dialog).getByLabelText("Department")).toBeInTheDocument();
      // Renamed to "Base Salary" 2026-08-11 so create and edit agree — it was
      // "Salary" here and "Base Salary" in edit mode, one field reading as two.
      // "(Monthly)" added 2026-08-12: the report divides this by the days in a
      // MONTH, so an annual figure would silently produce a ~12x Net Payable.
      expect(within(dialog).getByLabelText("Base Salary (Monthly)")).toBeInTheDocument();
      // No standalone "Manager" field in create mode — Department implies it.
      expect(within(dialog).queryByLabelText("Manager")).not.toBeInTheDocument();
    });

    it("states the monthly basis on the label AND in helper text", async () => {
      renderPage();
      await screen.findAllByText("Manager One");

      await userEvent.click(screen.getByRole("button", { name: "New User" }));
      const dialog = await screen.findByRole("dialog", { name: "New User" });

      // The label carries the accessible name, so the basis is announced to a
      // screen reader too — not only shown as helper text beneath.
      expect(within(dialog).getByLabelText("Base Salary (Monthly)")).toBeInTheDocument();
      expect(
        within(dialog).getByText(/Monthly gross — used for the per-day rate in the leave report/)
      ).toBeInTheDocument();
    });

    it("submits baseSalary as a NUMBER — the ₹ prefix is decoration, not part of the value", async () => {
      // The prefix renders inside the control, so the risk is it ending up in
      // the submitted value as "₹30000" and being rejected or stored as a
      // string. It is a sibling node; this pins that.
      userApi.createUser.mockResolvedValue({ data: {} });
      renderPage();
      await screen.findAllByText("Manager One");

      await userEvent.click(screen.getByRole("button", { name: "New User" }));
      const dialog = await screen.findByRole("dialog", { name: "New User" });

      await userEvent.type(within(dialog).getByLabelText("Name"), "Salary Probe");
      await userEvent.type(within(dialog).getByLabelText("Email"), "probe@test.local");
      await userEvent.type(within(dialog).getByLabelText("Password"), "Password123");
      await userEvent.click(within(dialog).getByLabelText("Role"));
      await userEvent.click(await screen.findByTitle("Executive"));
      await userEvent.type(within(dialog).getByLabelText("Base Salary (Monthly)"), "30000");

      await userEvent.click(within(dialog).getByRole("button", { name: "OK" }));

      await waitFor(() => expect(userApi.createUser).toHaveBeenCalled());
      expect(userApi.createUser).toHaveBeenCalledWith(
        expect.objectContaining({ baseSalary: 30000 })
      );
    });

    it("Role dropdown offers only Manager and Executive, not Sales Associate or Customer", async () => {
      renderPage();
      await screen.findAllByText("Manager One");

      await userEvent.click(screen.getByRole("button", { name: "New User" }));
      const dialog = await screen.findByRole("dialog", { name: "New User" });

      await userEvent.click(within(dialog).getByLabelText("Role"));

      expect(await screen.findByTitle("Manager")).toBeInTheDocument();
      expect(screen.getByTitle("Executive")).toBeInTheDocument();
      expect(screen.queryByTitle("Sales Associate")).not.toBeInTheDocument();
      expect(screen.queryByTitle("Customer")).not.toBeInTheDocument();
      expect(screen.queryByTitle("Employee")).not.toBeInTheDocument();
    });

    it("Department dropdown lists real teams with name and type", async () => {
      renderPage();
      await screen.findAllByText("Manager One");

      await userEvent.click(screen.getByRole("button", { name: "New User" }));
      const dialog = await screen.findByRole("dialog", { name: "New User" });

      await userEvent.click(within(dialog).getByLabelText("Department"));

      expect(await screen.findByTitle("North Sales Team (Sales)")).toBeInTheDocument();
      expect(screen.getByTitle("Install Crew")).toBeInTheDocument();
    });

    it("selecting a Department sets managerId to that team's headManagerId on submit", async () => {
      userApi.createUser.mockResolvedValue({ data: {} });
      renderPage();
      await screen.findAllByText("Manager One");

      await userEvent.click(screen.getByRole("button", { name: "New User" }));
      const dialog = await screen.findByRole("dialog", { name: "New User" });

      await userEvent.type(within(dialog).getByLabelText("Name"), "New Hire");
      await userEvent.type(within(dialog).getByLabelText("Email"), "newhire@test.local");
      await userEvent.type(within(dialog).getByLabelText("Password"), "Password123");

      await userEvent.click(within(dialog).getByLabelText("Role"));
      await userEvent.click(await screen.findByTitle("Executive"));

      await userEvent.click(within(dialog).getByLabelText("Department"));
      await userEvent.click(await screen.findByTitle("North Sales Team (Sales)"));

      await userEvent.click(within(dialog).getByRole("button", { name: "OK" }));

      await waitFor(() => {
        expect(userApi.createUser).toHaveBeenCalledWith(
          expect.objectContaining({ role: "employee", managerId: "user-1" })
        );
      });
      // The UI-only Department field itself is never sent to the backend.
      expect(userApi.createUser.mock.calls[0][0]).not.toHaveProperty("departmentTeamId");
    });
  });
});
