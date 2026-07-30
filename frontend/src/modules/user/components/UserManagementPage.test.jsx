import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { message } from "antd";
import { MemoryRouter } from "react-router-dom";
import UserManagementPage from "./UserManagementPage";
import useSessionStore from "../../../store/sessionStore";
import * as userApi from "../api/userApi";

// Same pattern as CustomersListPage.test.jsx — antd's `message` toast is
// portal-rendered outside RTL's reach under jsdom, so the mock function call
// is asserted directly instead of DOM text.
vi.mock("antd", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, message: { success: vi.fn(), error: vi.fn() } };
});

vi.mock("../api/userApi", () => ({
  listUsers: vi.fn(),
  updateUser: vi.fn(),
  deactivateUser: vi.fn(),
  reactivateUser: vi.fn(),
  adminResetPassword: vi.fn(),
  createUser: vi.fn(),
}));

vi.mock("../../../hooks/useUserDirectory", () => ({
  useUserDirectory: () => ({ users: [], isLoading: false }),
  default: () => ({ users: [], isLoading: false }),
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

  it("shows a New User button for admin and opens the create form", async () => {
    renderPage();
    await screen.findAllByText("Manager One");

    await userEvent.click(screen.getByRole("button", { name: "New User" }));

    expect(screen.getByRole("dialog", { name: "New User" })).toBeInTheDocument();
  });

  it("deactivates an active user after confirming", async () => {
    userApi.deactivateUser.mockResolvedValue({ data: {} });
    const { container } = renderPage();
    await screen.findAllByText("Manager One");

    const managerRow = container.querySelector('tr[data-row-key="user-1"]');
    await userEvent.click(within(managerRow).getByRole("button", { name: "Deactivate" }));
    await userEvent.click(await screen.findByRole("button", { name: "OK" }));

    await waitFor(() => {
      expect(userApi.deactivateUser).toHaveBeenCalledWith("user-1");
    });
    expect(message.success).toHaveBeenCalledWith("Manager One deactivated");
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

  describe("New User form (reworked 2026-07-30)", () => {
    it("shows the compact 4-row layout with Name/Email/Phone/Password/Role/Department/Salary", async () => {
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
      expect(within(dialog).getByLabelText("Salary")).toBeInTheDocument();
      // No standalone "Manager" field in create mode — Department implies it.
      expect(within(dialog).queryByLabelText("Manager")).not.toBeInTheDocument();
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
