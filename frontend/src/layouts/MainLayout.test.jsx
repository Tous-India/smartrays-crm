import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import MainLayout from "./MainLayout";
import { LEAVE_NOTIFICATION_TYPES } from "../hooks/useSidebarBadgeCounts";
import useSessionStore from "../store/sessionStore";
import * as userApi from "../modules/user/api/userApi";
import * as notificationApi from "../modules/notification/api/notificationApi";

vi.mock("antd", async (importOriginal) => {
  const actual = await importOriginal();
  // Components read `message` via `App.useApp()` (§7.28 message-rendering
  // fix — the static import silently fails to render under React 19), not
  // the static export, so the mock has to intercept the hook too.
  const mockMessage = { success: vi.fn(), error: vi.fn() };
  actual.App.useApp = () => ({ message: mockMessage });
  return { ...actual, message: mockMessage };
});

vi.mock("../modules/user/api/userApi", () => ({
  updateUser: vi.fn(),
}));

vi.mock("../modules/notification/api/notificationApi", () => ({
  listNotifications: vi.fn().mockResolvedValue({ data: { data: [] } }),
  listNotificationsByType: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  // Deliberately still mocked even though §7.43 REMOVED this export from the
  // real module: asserting it is never called is what proves the nav-click
  // auto-clear is gone. Without it here, these tests would pass against the
  // old code too, since the old code called this and not markAllNotificationsRead.
  markNotificationsReadByType: vi.fn(),
}));

function renderLayout(initialPath = "/dashboard") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route element={<MainLayout />}>
          <Route path="/dashboard" element={<div>Dashboard Content</div>} />
          <Route path="/leads" element={<div>Leads Content</div>} />
          <Route path="/leave" element={<div>Leave Content</div>} />
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
    notificationApi.listNotificationsByType.mockResolvedValue({ data: { data: [] } });
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

  it("shows NO Tickets nav item, even for a user holding every tickets permission", async () => {
    // Tickets was deferred from the UI 2026-08-07. The permission tiers still
    // exist (the backend enforces them and the permissions matrix still
    // manages them), so granting them explicitly is the case that would
    // regress if the nav block were ever uncommented by accident.
    useSessionStore.setState({
      user: {
        ...ADMIN_USER,
        role: "manager",
        permissions: { tickets: { view_all: true, view_assigned: true, assign: true } },
      },
      isAuthenticated: true,
      isLoading: false,
    });

    renderLayout();

    await screen.findByText("Dashboard Content");
    expect(screen.queryByRole("menuitem", { name: /Tickets/ })).not.toBeInTheDocument();
  });

  it("still shows Settings for a user with no admin grants — it holds their own Account (§7.39)", async () => {
    useSessionStore.setState({
      user: { _id: "sales-1", name: "Sam Sales", role: "sales_associate", permissions: {} },
      isAuthenticated: true,
      isLoading: false,
    });

    renderLayout();

    await screen.findByText("Dashboard Content");
    // Settings is no longer admin-gated (§7.39): it carries every user's own
    // Account (2FA, password). Which TABS appear inside is still gated.
    expect(screen.getAllByText("Settings").length).toBeGreaterThan(0);
  });

  it("marks the current page's nav item as selected", async () => {
    renderLayout("/leads");

    const leadsLink = await screen.findByRole("menuitem", { name: /Leads/ });
    expect(leadsLink.className).toContain("ant-menu-item-selected");

    const dashboardLink = screen.getByRole("menuitem", { name: /Dashboard/ });
    expect(dashboardLink.className).not.toContain("ant-menu-item-selected");
  });
});

describe("MainLayout — Leads/Leave sidebar notification badges (§7.29, 2026-07-31)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mockCountsByType({ leads = 0, leave = 0 } = {}) {
    notificationApi.listNotificationsByType.mockImplementation((types) => {
      if (types.includes("lead_created")) {
        return Promise.resolve({ data: { data: Array.from({ length: leads }) } });
      }
      return Promise.resolve({ data: { data: Array.from({ length: leave }) } });
    });
  }

  it("shows the unread lead_created/lead_assigned notification count on the Leads nav item", async () => {
    mockCountsByType({ leads: 5 });
    useSessionStore.setState({ user: ADMIN_USER, isAuthenticated: true, isLoading: false });

    renderLayout();

    const leadsItem = await screen.findByRole("menuitem", { name: /Leads/ });
    expect(within(leadsItem).getByText("5")).toBeInTheDocument();
    expect(notificationApi.listNotificationsByType).toHaveBeenCalledWith(
      ["lead_created", "lead_assigned"],
      { unreadOnly: true }
    );
  });

  it("hides the Leads badge entirely when the count is 0", async () => {
    mockCountsByType({ leads: 0 });
    useSessionStore.setState({ user: ADMIN_USER, isAuthenticated: true, isLoading: false });

    renderLayout();

    const leadsItem = await screen.findByRole("menuitem", { name: /Leads/ });
    expect(within(leadsItem).queryByText("0")).not.toBeInTheDocument();
  });

  it("shows the unread leave-notification count on the Attendance nav item for an admin (Leave moved there, §B4)", async () => {
    mockCountsByType({ leave: 3 });
    useSessionStore.setState({ user: ADMIN_USER, isAuthenticated: true, isLoading: false });

    renderLayout();

    const leaveItem = await screen.findByRole("menuitem", { name: /Attendance/ });
    expect(within(leaveItem).getByText("3")).toBeInTheDocument();
    expect(notificationApi.listNotificationsByType).toHaveBeenCalledWith(
      LEAVE_NOTIFICATION_TYPES,
      { unreadOnly: true }
    );
  });

  it("also shows the leave badge for a non-admin (their own leave_approved/leave_declined notifications) — no role gate", async () => {
    mockCountsByType({ leave: 2 });
    useSessionStore.setState({
      user: { _id: "manager-1", name: "Manager One", role: "manager", permissions: { leads: { view: true } } },
      isAuthenticated: true,
      isLoading: false,
    });

    renderLayout();

    const leaveItem = await screen.findByRole("menuitem", { name: /Attendance/ });
    expect(within(leaveItem).getByText("2")).toBeInTheDocument();
  });

  /**
   * §7.43 (2026-08-06) — the inverse of what these two tests used to assert.
   * Clicking a nav item marked every unread notification of that type read,
   * so an admin who opened Attendance to look at ATTENDANCE silently
   * destroyed their own pending-leave badge. That is the whole "the admin
   * never receives leave notifications" report: the record was created and
   * delivered correctly, then dismissed by a navigation.
   */
  it("clicking the Leads nav item does NOT mark anything read", async () => {
    mockCountsByType({ leads: 5 });
    useSessionStore.setState({ user: ADMIN_USER, isAuthenticated: true, isLoading: false });

    renderLayout();
    const leadsItem = await screen.findByRole("menuitem", { name: /Leads/ });
    await within(leadsItem).getByText("5");

    await userEvent.click(within(leadsItem).getByRole("link"));

    expect(notificationApi.markNotificationsReadByType).not.toHaveBeenCalled();
    expect(notificationApi.markAllNotificationsRead).not.toHaveBeenCalled();
  });

  it("clicking the Attendance nav item leaves the Leave badge intact", async () => {
    mockCountsByType({ leads: 5, leave: 3 });
    useSessionStore.setState({ user: ADMIN_USER, isAuthenticated: true, isLoading: false });

    renderLayout();
    const leaveItem = await screen.findByRole("menuitem", { name: /Attendance/ });
    expect(within(leaveItem).getByText("3")).toBeInTheDocument();

    await userEvent.click(within(leaveItem).getByRole("link"));

    // Nothing was dismissed, by either route. The badge's own survival after
    // navigation is asserted at the hook level (it exposes no clearing
    // function at all) and end-to-end in a browser — following the link
    // unmounts this layout, so it cannot be re-queried here.
    expect(notificationApi.markNotificationsReadByType).not.toHaveBeenCalled();
    expect(notificationApi.markAllNotificationsRead).not.toHaveBeenCalled();
  });
});

describe("MainLayout — sidebar footer profile menu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    notificationApi.listNotificationsByType.mockResolvedValue({ data: { data: [] } });
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

  it("renders a Settings gear icon in the top strip, linking straight to /settings/users (moved out of the sidebar 2026-08-05)", async () => {
    renderLayout();

    await screen.findByText("Priya Admin");
    const settingsLink = screen.getByLabelText("Settings");
    expect(settingsLink).toHaveAttribute("href", "/settings/users");
  });

  it("still shows the Settings gear for a user with no admin grants (§7.39)", async () => {
    useSessionStore.setState({
      user: { _id: "sales-1", name: "Sam Sales", role: "sales_associate", permissions: {} },
      isAuthenticated: true,
      isLoading: false,
    });

    renderLayout();

    await screen.findByText("Sam Sales");
    expect(screen.getByLabelText("Settings")).toBeInTheDocument();
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

describe("MainLayout — mobile hamburger auto-closes on route change", () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    vi.clearAllMocks();
    notificationApi.listNotificationsByType.mockResolvedValue({ data: { data: [] } });
    useSessionStore.setState({ user: ADMIN_USER, isAuthenticated: true, isLoading: false });
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  // `src/test/setup.js`'s global stub always reports `matches: false` (no
  // real layout engine in jsdom) — overridden here, per AntD `Sider`'s own
  // breakpoint media query, to simulate a mobile-width viewport so the
  // zero-width hamburger trigger actually renders.
  function mockMobileViewport() {
    window.matchMedia = (query) => ({
      matches: true,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    });
  }

  it("closes the sidebar automatically after tapping a nav link on a mobile viewport", async () => {
    mockMobileViewport();
    const { container } = renderLayout();

    // Starts collapsed (closed) on initial mobile load — Sider's own
    // responsive handler fires on mount.
    const aside = container.querySelector(".ant-layout-sider");
    await waitFor(() => expect(aside.className).toContain("ant-layout-sider-collapsed"));

    // Open the drawer via the zero-width hamburger trigger.
    const hamburger = container.querySelector(".ant-layout-sider-zero-width-trigger");
    await userEvent.click(hamburger);
    await waitFor(() => expect(aside.className).not.toContain("ant-layout-sider-collapsed"));

    // Tap a nav item to navigate.
    const leadsItem = await screen.findByRole("menuitem", { name: /Leads/ });
    await userEvent.click(within(leadsItem).getByRole("link"));

    expect(await screen.findByText("Leads Content")).toBeInTheDocument();
    await waitFor(() => expect(aside.className).toContain("ant-layout-sider-collapsed"));
  });

  it("also closes on browser back/forward navigation, not just a nav-link tap", async () => {
    mockMobileViewport();
    const { container } = renderLayout("/leads");
    await screen.findByText("Leads Content");

    const aside = container.querySelector(".ant-layout-sider");
    const hamburger = container.querySelector(".ant-layout-sider-zero-width-trigger");
    await userEvent.click(hamburger);
    await waitFor(() => expect(aside.className).not.toContain("ant-layout-sider-collapsed"));

    // Simulate a back-navigation to a different route already in history.
    const leadsItem = await screen.findByRole("menuitem", { name: /Dashboard/ });
    await userEvent.click(within(leadsItem).getByRole("link"));

    await waitFor(() => expect(aside.className).toContain("ant-layout-sider-collapsed"));
  });

  it("does not force-collapse the desktop sidebar on navigation (matches: false)", async () => {
    // Default global stub already reports matches: false — a real desktop
    // viewport — confirming the fix is scoped to mobile only.
    const { container } = renderLayout();
    const aside = container.querySelector(".ant-layout-sider");
    await waitFor(() => expect(aside.className).not.toContain("ant-layout-sider-collapsed"));

    const leadsItem = await screen.findByRole("menuitem", { name: /Leads/ });
    await userEvent.click(within(leadsItem).getByRole("link"));

    expect(await screen.findByText("Leads Content")).toBeInTheDocument();
    expect(aside.className).not.toContain("ant-layout-sider-collapsed");
  });
});
