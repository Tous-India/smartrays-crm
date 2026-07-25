import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import MainLayout from "./MainLayout";
import useSessionStore from "../store/sessionStore";
import * as userApi from "../modules/user/api/userApi";

vi.mock("../modules/user/api/userApi", () => ({
  updateUser: vi.fn(),
}));

vi.mock("../modules/notification/api/notificationApi", () => ({
  listNotifications: vi.fn().mockResolvedValue({ data: { data: [] } }),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
}));

function renderLayout(initialPath = "/dashboard") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route element={<MainLayout />}>
          <Route path="/dashboard" element={<div>Dashboard Content</div>} />
          <Route path="/leads" element={<div>Leads Content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

const ADMIN_USER = {
  _id: "admin-1",
  name: "Priya Admin",
  email: "priya@smartrays.test",
  phone: "555-0100",
  role: "admin",
  permissions: {},
};

describe("MainLayout — nav composition and Settings gating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSessionStore.setState({ user: ADMIN_USER, isAuthenticated: true, isLoading: false });
  });

  it("shows a single flat Settings nav item (no submenu) linking to the Users tab, for an admin", async () => {
    renderLayout();

    const settingsItem = await screen.findByRole("menuitem", { name: /Settings/ });
    // A flat link straight to /settings/users — not an expandable submenu,
    // so there should be no separate "User Management"/"Permission
    // Settings" child items rendered inline in the sidebar itself.
    expect(settingsItem.querySelector("a")).toHaveAttribute("href", "/settings/users");
    expect(screen.queryByText("User Management")).not.toBeInTheDocument();
    expect(screen.queryByText("Permission Settings")).not.toBeInTheDocument();
  });

  it("hides the Settings group entirely for a user with neither users.* nor permissions.manage", async () => {
    useSessionStore.setState({
      user: { _id: "sales-1", name: "Sam Sales", role: "sales_associate", permissions: {} },
      isAuthenticated: true,
      isLoading: false,
    });

    renderLayout();

    await screen.findByText("Dashboard Content");
    expect(screen.queryByText("Settings")).not.toBeInTheDocument();
  });

  it("marks the current page's nav item as selected", async () => {
    renderLayout("/leads");

    const leadsLink = await screen.findByRole("menuitem", { name: /Leads/ });
    expect(leadsLink.className).toContain("ant-menu-item-selected");

    const dashboardLink = screen.getByRole("menuitem", { name: /Dashboard/ });
    expect(dashboardLink.className).not.toContain("ant-menu-item-selected");
  });
});

describe("MainLayout — sidebar footer profile menu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSessionStore.setState({ user: ADMIN_USER, isAuthenticated: true, isLoading: false });
  });

  it("shows the current user's name and role in the sidebar footer", async () => {
    renderLayout();

    expect(await screen.findByText("Priya Admin")).toBeInTheDocument();
    expect(screen.getByText("Admin")).toBeInTheDocument();
  });

  it("opens the Edit Profile modal directly from clicking the sidebar footer's name/avatar and submits via PATCH /users/:id", async () => {
    userApi.updateUser.mockResolvedValue({ data: { data: {} } });

    renderLayout();

    // No intermediate dropdown click — the avatar/name area opens Edit
    // Profile directly now, since "Sign out" moved to its own distinct
    // always-visible button (§ sidebar redesign, matching the reference).
    await userEvent.click(await screen.findByText("Priya Admin"));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    const nameInput = screen.getByLabelText("Name");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Priya P. Admin");

    await userEvent.click(screen.getByRole("button", { name: "OK" }));

    await waitFor(() => {
      expect(userApi.updateUser).toHaveBeenCalledWith(
        "admin-1",
        expect.objectContaining({ name: "Priya P. Admin" })
      );
    });
  });

  it("does not render a duplicate profile menu in the top bar", async () => {
    renderLayout();

    await screen.findByText("Priya Admin");
    // Only one "Priya Admin" label exists on the page — the sidebar footer,
    // not also the top bar (§ UI/UX pass: one location for this menu, not
    // duplicated in both places).
    expect(screen.getAllByText("Priya Admin")).toHaveLength(1);
  });

  it("renders a Settings gear icon next to the name, linking straight to /settings/users", async () => {
    renderLayout();

    await screen.findByText("Priya Admin");
    const settingsLink = screen.getByTitle("Settings");
    expect(settingsLink).toHaveAttribute("href", "/settings/users");
  });

  it("hides the footer's Settings gear icon for a user with no Settings access", async () => {
    useSessionStore.setState({
      user: { _id: "sales-1", name: "Sam Sales", role: "sales_associate", permissions: {} },
      isAuthenticated: true,
      isLoading: false,
    });

    renderLayout();

    await screen.findByText("Sam Sales");
    expect(screen.queryByTitle("Settings")).not.toBeInTheDocument();
  });

  it("renders a distinct, always-visible 'Sign out' button (not tucked inside a menu) that logs out and redirects to /login", async () => {
    useSessionStore.setState({
      user: ADMIN_USER,
      isAuthenticated: true,
      isLoading: false,
      logout: vi.fn().mockResolvedValue(undefined),
    });

    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Routes>
          <Route element={<MainLayout />}>
            <Route path="/dashboard" element={<div>Dashboard Content</div>} />
          </Route>
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>
      </MemoryRouter>
    );

    const signOutButton = await screen.findByRole("button", { name: /Sign out/ });
    await userEvent.click(signOutButton);

    expect(useSessionStore.getState().logout).toHaveBeenCalled();
    expect(await screen.findByText("Login Page")).toBeInTheDocument();
  });
});
