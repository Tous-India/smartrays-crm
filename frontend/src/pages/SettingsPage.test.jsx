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

  it("shows a 403 result for a user with no Settings access at all", async () => {
    useSessionStore.setState({
      user: { _id: "emp-1", role: "employee", permissions: {} },
      isAuthenticated: true,
      isLoading: false,
    });

    renderSettings("/settings/users");

    expect(await screen.findByText("Not authorized")).toBeInTheDocument();
  });
});
