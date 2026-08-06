import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import SettingsPage from "./SettingsPage";
import useSessionStore from "../store/sessionStore";
import * as userApi from "../modules/user/api/userApi";

vi.mock("../modules/user/api/userApi", () => ({
  listUsers: vi.fn(),
  updateUser: vi.fn(),
  deactivateUser: vi.fn(),
  reactivateUser: vi.fn(),
  createUser: vi.fn(),
}));

vi.mock("../services/userDirectoryApi", () => ({
  fetchUserDropdown: vi.fn().mockResolvedValue({ data: { data: [] } }),
}));

// AntD's Tabs mounts every pane's children up front (only the active one is
// shown), so PermissionManagementPage's registry fetch fires regardless of
// which tab is actually active — same reason the Teams tab needs its own
// useTeams mock elsewhere.
vi.mock("../modules/permission/api/permissionApi", () => ({
  getPermissionRegistry: vi.fn().mockResolvedValue({ data: { data: { leads: ["view", "create"] } } }),
  getRoleTemplate: vi.fn().mockResolvedValue({ data: { data: { role: "admin", permissions: {} } } }),
  getUserPermissions: vi.fn(),
  updateRoleTemplate: vi.fn(),
  updateUserPermissions: vi.fn(),
  resetUserPermissions: vi.fn(),
}));

function renderSettings(initialPath = "/settings/users") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/settings/users" element={<SettingsPage />} />
        <Route path="/settings/permissions" element={<SettingsPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("SettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userApi.listUsers.mockResolvedValue({ data: { data: [] } });
  });

  it("renders User Management and Permissions as tabs (not separate pages) for an admin", async () => {
    useSessionStore.setState({
      user: { _id: "admin-1", role: "admin", permissions: {} },
      isAuthenticated: true,
      isLoading: false,
    });

    renderSettings();

    expect(await screen.findByRole("tab", { name: "User Management" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Permissions" })).toBeInTheDocument();
  });

  it("defaults to the Users tab active when the URL is /settings/users", async () => {
    useSessionStore.setState({
      user: { _id: "admin-1", role: "admin", permissions: {} },
      isAuthenticated: true,
      isLoading: false,
    });

    renderSettings("/settings/users");

    const usersTab = await screen.findByRole("tab", { name: "User Management" });
    expect(usersTab).toHaveAttribute("aria-selected", "true");
  });

  it("activates the Permissions tab when the URL is /settings/permissions", async () => {
    useSessionStore.setState({
      user: { _id: "admin-1", role: "admin", permissions: {} },
      isAuthenticated: true,
      isLoading: false,
    });

    renderSettings("/settings/permissions");

    const permissionsTab = await screen.findByRole("tab", { name: "Permissions" });
    expect(permissionsTab).toHaveAttribute("aria-selected", "true");
  });

  it("switching tabs navigates the URL (deep-linkable)", async () => {
    useSessionStore.setState({
      user: { _id: "admin-1", role: "admin", permissions: {} },
      isAuthenticated: true,
      isLoading: false,
    });

    renderSettings("/settings/users");

    await userEvent.click(await screen.findByRole("tab", { name: "Permissions" }));

    expect(await screen.findByRole("tab", { name: "Permissions" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });

  it("only shows the Permissions tab for a user with permissions.manage but no users grant", async () => {
    useSessionStore.setState({
      user: { _id: "mgr-1", role: "manager", permissions: { permissions: { manage: true } } },
      isAuthenticated: true,
      isLoading: false,
    });

    renderSettings("/settings/permissions");

    expect(await screen.findByRole("tab", { name: "Permissions" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "User Management" })).not.toBeInTheDocument();
  });

  it("shows ONLY the Account tab for a user with no administrative Settings access (§7.38)", async () => {
    useSessionStore.setState({
      user: { _id: "emp-1", role: "employee", permissions: {} },
      isAuthenticated: true,
      isLoading: false,
    });

    renderSettings("/settings/users");

    // Account is everyone's own security settings (2FA, password), so
    // Settings is no longer wholly off-limits to a non-admin — but the
    // administrative tabs stay hidden.
    expect(await screen.findByRole("tab", { name: "Account" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "User Management" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Permissions" })).not.toBeInTheDocument();
    expect(screen.queryByText("Not authorized")).not.toBeInTheDocument();
  });
});
