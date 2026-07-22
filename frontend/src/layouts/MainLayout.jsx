import { useMemo, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Layout, Menu, Avatar, Dropdown } from "antd";
import { UserOutlined, LogoutOutlined, EditOutlined, SettingOutlined } from "@ant-design/icons";
import useSessionStore from "../store/sessionStore";
import { can } from "../utils/permission.utils";
import { ROUTE_PATHS } from "../constants/routePaths.constants";
import { USER_ROLE_LABELS } from "../modules/user/constants/user.constants";
import BrandLogo from "../components/BrandLogo";
import EditProfileModal from "../modules/user/components/EditProfileModal";
import LiveClock from "./LiveClock";

const { Header, Sider, Content } = Layout;

const SIDER_WIDTH = 220;

/**
 * Picks which nav key should render "selected," matching on the LONGEST
 * key that's either an exact match or a real path segment prefix of the
 * current location (`/leads/board`/`/leads/:id` all still highlight the
 * `/leads` item; `startsWith` alone without the `/` boundary would wrongly
 * match e.g. a hypothetical `/lead` against `/leads`, so the boundary check
 * matters even though today's route set doesn't happen to collide).
 */
function resolveSelectedKey(pathname, candidateKeys) {
  const matches = candidateKeys.filter(
    (key) => pathname === key || pathname.startsWith(`${key}/`)
  );
  if (matches.length === 0) {
    return null;
  }
  return matches.reduce((longest, key) => (key.length > longest.length ? key : longest));
}

/**
 * The one dashboard shell every non-customer role shares, per §7.13 —
 * composes its nav items by role + permission rather than branching into
 * separate Admin/Manager/Sales/Employee layouts. Each nav item is filtered
 * with the same `can()` check `PermissionGate` uses, so the menu itself
 * never shows a link the user has no grant for (UI convenience only — the
 * backend still enforces the real access check on every request).
 *
 * **Layout (UI/UX pass):** the sidebar is a fixed, full-viewport-height
 * column with three independent regions — logo (pinned), nav list (the
 * ONLY part that scrolls, via its own `overflow-y-auto`, if it's taller
 * than the viewport), and a footer (pinned) holding the current user's
 * identity + the single Edit Profile/Logout menu for the whole app (see
 * below). The right-hand column (top bar + page content) scrolls normally
 * with the page — only the sidebar's own internal regions are fixed/
 * independently-scrolling, not the whole app shell.
 */
function MainLayout() {
  const user = useSessionStore((state) => state.user);
  const logout = useSessionStore((state) => state.logout);
  const navigate = useNavigate();
  const location = useLocation();
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);

  const canViewSettings = useMemo(() => {
    return (
      can(user, "users", "view_all") || can(user, "users", "view_team") || can(user, "permissions", "manage")
    );
  }, [user]);

  const menuItems = useMemo(() => {
    const allItems = [
      { key: ROUTE_PATHS.DASHBOARD, label: "Dashboard", show: true },
      { key: ROUTE_PATHS.LEADS, label: "Leads", show: can(user, "leads", "view") },
      { key: ROUTE_PATHS.CUSTOMERS, label: "Customers", show: can(user, "customers", "view") },
      { key: ROUTE_PATHS.TASKS, label: "Tasks", show: can(user, "tasks", "view") },
      { key: ROUTE_PATHS.ATTENDANCE, label: "Attendance", show: true },
      { key: ROUTE_PATHS.LEAVE, label: "Leave", show: true },
      {
        key: ROUTE_PATHS.LOCATION,
        label: "Location",
        show:
          can(user, "location", "view") ||
          can(user, "location", "view_team") ||
          can(user, "location", "view_all"),
      },
      {
        key: ROUTE_PATHS.PAYROLL,
        label: "Payroll",
        show: can(user, "payroll", "view") || can(user, "payroll", "run"),
      },
      { key: ROUTE_PATHS.TRAVEL_LOGS, label: "Travel Logs", show: true },
      {
        key: ROUTE_PATHS.TICKETS,
        label: "Tickets",
        show: can(user, "tickets", "view_assigned") || can(user, "tickets", "view_all"),
      },
      { key: ROUTE_PATHS.PAYMENTS, label: "Payments", show: user?.role === "admin" },
      { key: ROUTE_PATHS.AMC, label: "AMC", show: can(user, "amc", "view") },
      { key: ROUTE_PATHS.REPORTS, label: "Reports", show: true },
    ];

    const items = allItems
      .filter((item) => item.show)
      .map((item) => ({ key: item.key, label: <Link to={item.key}>{item.label}</Link> }));

    // Settings — a single flat nav item (no submenu/dropdown — see the
    // sidebar redesign this replaced the collapsible-submenu approach
    // with), linking straight to the Users tab of the combined SettingsPage
    // (`ROUTE_PATHS.SETTINGS_USERS` — `resolveSelectedKey`'s prefix match
    // still highlights this item while on `/settings/permissions` too,
    // since both live under `/settings`).
    if (canViewSettings) {
      items.push({
        // Keyed to the bare `/settings` prefix (not `SETTINGS_USERS`
        // specifically) so `resolveSelectedKey`'s prefix match still
        // highlights this item while on `/settings/permissions` too — both
        // concrete routes live under this same prefix.
        key: ROUTE_PATHS.SETTINGS,
        icon: <SettingOutlined />,
        label: <Link to={ROUTE_PATHS.SETTINGS_USERS}>Settings</Link>,
      });
    }

    return items;
  }, [user, canViewSettings]);

  const allKnownKeys = useMemo(() => menuItems.map((item) => item.key), [menuItems]);

  const selectedKey = resolveSelectedKey(location.pathname, allKnownKeys);
  const selectedKeys = selectedKey ? [selectedKey] : [];

  async function handleLogout() {
    await logout();
    navigate(ROUTE_PATHS.LOGIN);
  }

  const profileMenuItems = [
    {
      key: "edit-profile",
      label: "Edit Profile",
      icon: <EditOutlined />,
      onClick: () => setIsEditProfileOpen(true),
    },
    {
      key: "logout",
      label: "Log out",
      icon: <LogoutOutlined />,
      onClick: handleLogout,
    },
  ];

  return (
    <Layout className="min-h-screen">
      {/*
        Fixed full-viewport sidebar — cool off-white/light-grey background
        (§ sidebar redesign, reversing the earlier dark-navy decision), three
        independent regions, see the component comment above.
        `insetInlineStart`/`insetInlineEnd` are the logical-property
        equivalents of left/right, matching AntD's own RTL-aware convention
        rather than hardcoding a direction.
      */}
      <Sider
        width={SIDER_WIDTH}
        breakpoint="lg"
        collapsedWidth="0"
        className="app-sider"
        style={{
          position: "fixed",
          insetInlineStart: 0,
          top: 0,
          bottom: 0,
          height: "100vh",
          // Cool light grey (slight blue undertone), not a warm/cream
          // off-white — picked and checked visually against that specific
          // failure mode.
          background: "#F4F6F9",
        }}
      >
        {/* Top — pinned, never scrolls. Color (not white) horizontal logo —
            the light background gives it real contrast again. Slightly
            shorter than before (was h-16/64px) — every bit of fixed-region
            height matters for the nav list fitting without scroll. */}
        <div className="flex h-14 shrink-0 items-center justify-center border-b border-gray-200 px-4">
          <BrandLogo className="w-36" variant="color" layout="horizontal" />
        </div>

        {/* Middle — the ONLY scrollable region, and only if the list is
            actually taller than the space left for it. `app-sidebar-scroll`
            (styles/index.css) hides the scrollbar completely — still
            scrollable via wheel/trackpad/keyboard, just no visible bar —
            for the rare genuinely-short-viewport case, see that class's
            own comment for the full history/reasoning. */}
        <div className="app-sidebar-scroll min-h-0 flex-1 overflow-y-auto">
          <Menu
            mode="inline"
            theme="light"
            className="app-sidebar-menu !border-e-0"
            items={menuItems}
            selectedKeys={selectedKeys}
          />
        </div>

        {/* Bottom — pinned, never scrolls. The single Edit Profile/Logout
            menu for the whole app lives here (not duplicated in the top
            bar) since this footer is always visible regardless of nav
            scroll position or page content height. A small gear icon next
            to the name is a second, always-visible entry point straight to
            Settings (on top of the nav-list item above), per the sidebar
            redesign. */}
        <div className="shrink-0 border-t border-gray-200 p-2">
          <div className="flex items-center gap-2">
            <Dropdown menu={{ items: profileMenuItems }} placement="topLeft" trigger={["click"]}>
              <div className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md p-1.5 hover:bg-black/5">
                <Avatar icon={<UserOutlined />} size="small" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-gray-800">{user?.name}</div>
                  <div className="truncate text-xs text-gray-500">
                    {USER_ROLE_LABELS[user?.role] || user?.role}
                  </div>
                </div>
              </div>
            </Dropdown>
            {canViewSettings && (
              <Link
                to={ROUTE_PATHS.SETTINGS_USERS}
                title="Settings"
                className="flex shrink-0 items-center justify-center rounded-md p-2 text-gray-500 hover:bg-black/5 hover:text-gray-800"
              >
                <SettingOutlined />
              </Link>
            )}
          </div>
        </div>
      </Sider>

      {/* Tailwind arbitrary value, not inline style — needs the responsive
          prefix so this margin drops to 0 below AntD's own `lg` Sider
          breakpoint (992px), where the Sider auto-collapses to width 0 and
          reserving 220px of empty margin would otherwise leave a dead gap. */}
      <Layout className="ms-0 lg:ms-[220px]">
        <Header className="!flex !h-12 items-center justify-between !bg-brand-navy px-6 !leading-none">
          <LiveClock />
        </Header>
        <Content className="m-4">
          {/* 100vh minus the shortened 48px header minus this Content's own
              1rem top+bottom margin (m-4). */}
          <div className="min-h-[calc(100vh-5rem)] rounded-lg bg-white p-6">
            <Outlet />
          </div>
        </Content>
      </Layout>

      <EditProfileModal open={isEditProfileOpen} onClose={() => setIsEditProfileOpen(false)} />
    </Layout>
  );
}

export default MainLayout;
