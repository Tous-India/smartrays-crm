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

  const menuItems = useMemo(() => {
    const canViewUsers = can(user, "users", "view_all") || can(user, "users", "view_team");
    const canManagePermissions = can(user, "permissions", "manage");

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

    // Settings — User Management + Permissions grouped under one collapsible
    // submenu rather than flat top-level items (§ UI/UX pass), shown only if
    // at least one child would actually be visible to this user.
    if (canViewUsers || canManagePermissions) {
      items.push({
        key: "settings",
        label: "Settings",
        icon: <SettingOutlined />,
        children: [
          canViewUsers && {
            key: ROUTE_PATHS.SETTINGS_USERS,
            label: <Link to={ROUTE_PATHS.SETTINGS_USERS}>User Management</Link>,
          },
          canManagePermissions && {
            key: ROUTE_PATHS.SETTINGS_PERMISSIONS,
            label: <Link to={ROUTE_PATHS.SETTINGS_PERMISSIONS}>Permission Settings</Link>,
          },
        ].filter(Boolean),
      });
    }

    return items;
  }, [user]);

  const allKnownKeys = useMemo(
    () => menuItems.flatMap((item) => (item.children ? item.children.map((child) => child.key) : [item.key])),
    [menuItems]
  );

  const selectedKey = resolveSelectedKey(location.pathname, allKnownKeys);
  const selectedKeys = selectedKey ? [selectedKey] : [];
  const defaultOpenKeys = selectedKey?.startsWith("/settings") ? ["settings"] : [];

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
        Fixed full-viewport sidebar (dark navy, per the brand token — not a
        generic black) — three independent regions, see the component
        comment above. `insetInlineStart`/`insetInlineEnd` are the
        logical-property equivalents of left/right, matching AntD's own
        RTL-aware convention rather than hardcoding a direction.
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
          background: "var(--color-brand-navy)",
        }}
      >
        {/* Top — pinned, never scrolls. */}
        <div className="flex h-16 shrink-0 items-center justify-center border-b border-white/10 px-4">
          <BrandLogo className="w-40" variant="white" layout="horizontal" />
        </div>

        {/* Middle — the ONLY scrollable region, and only if the list is
            actually taller than the space left for it. */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Menu
            mode="inline"
            theme="dark"
            className="app-sidebar-menu !border-e-0"
            items={menuItems}
            selectedKeys={selectedKeys}
            defaultOpenKeys={defaultOpenKeys}
          />
        </div>

        {/* Bottom — pinned, never scrolls. The single Edit Profile/Logout
            menu for the whole app lives here (not duplicated in the top
            bar) since this footer is always visible regardless of nav
            scroll position or page content height. */}
        <div className="shrink-0 border-t border-white/10 p-3">
          <Dropdown menu={{ items: profileMenuItems }} placement="topLeft" trigger={["click"]}>
            <div className="flex cursor-pointer items-center gap-2 rounded-md p-2 hover:bg-white/10">
              <Avatar icon={<UserOutlined />} size="small" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-white">{user?.name}</div>
                <div className="truncate text-xs text-white/60">
                  {USER_ROLE_LABELS[user?.role] || user?.role}
                </div>
              </div>
            </div>
          </Dropdown>
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
