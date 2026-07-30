import { useMemo, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Layout, Menu, Avatar, Button, Badge } from "antd";
import {
  UserOutlined,
  LogoutOutlined,
  SettingOutlined,
  DashboardOutlined,
  RiseOutlined,
  TeamOutlined,
  CalendarOutlined,
  FileDoneOutlined,
  EnvironmentOutlined,
  WalletOutlined,
  CarOutlined,
  CustomerServiceOutlined,
  CreditCardOutlined,
  SafetyCertificateOutlined,
  BarChartOutlined,
} from "@ant-design/icons";
import useSessionStore from "../store/sessionStore";
import { can } from "../utils/permission.utils";
import useSidebarBadgeCounts from "../hooks/useSidebarBadgeCounts";
import { ROUTE_PATHS } from "../constants/routePaths.constants";
import { USER_ROLE_LABELS } from "../modules/user/constants/user.constants";
import BrandLogo from "../components/BrandLogo";
import EditProfileModal from "../modules/user/components/EditProfileModal";
import LiveClock from "./LiveClock";
import NotificationBell from "../modules/notification/components/NotificationBell";

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
 * **Layout:** the sidebar is a fixed, full-viewport-height column with
 * three independent regions — logo (pinned), nav list (the ONLY part that
 * scrolls, via its own `overflow-y-auto`, and only if genuinely taller than
 * the viewport — invisible scrollbar even then, see `styles/index.css`),
 * and a footer (pinned) holding the current user's identity + Sign out. The
 * top bar is ALSO fixed (full width minus the sidebar, via the same
 * `ms-0 lg:ms-[220px]` responsive margin the Content column uses, so it
 * collapses/expands in lockstep with the sidebar) — only `Content` actually
 * scrolls with the page; it gets a top margin equal to the top bar's height
 * so nothing renders underneath it on initial load.
 *
 * **Visual design — matched to a reference CRM's sidebar** (a screenshot
 * supplied for this task, not a project asset, deleted after use), with
 * ONE deliberate exception: the logo header stays WHITE (the established
 * color-logo-on-white decision from the immediately preceding tasks),
 * where the reference shows it dark. Everything else follows the
 * reference as closely as reasonably possible — see the inline comments at
 * each piece for what was matched exactly vs. adapted:
 * - Nav section background: near-black (matched).
 * - Icon + label per item (matched — the reference's own pattern; specific
 *   icon choices are this project's own, mapped per module by convention).
 * - Active item: a solid left accent bar + rounded-rect background tint
 *   (matched shape/structure) — in this project's OWN brand green rather
 *   than the reference's purple/violet accent (color substituted
 *   deliberately, to stay consistent with the brand-green used everywhere
 *   else in this app; the gradient-left-border tried in an earlier pass is
 *   dropped entirely, since the reference shows a solid accent, not a
 *   gradient).
 * - Footer: avatar + name + gear icon, on the SAME dark background as the
 *   nav list (a continuous dark region below the white header) — matches
 *   the reference's own continuous-dark-below-header structure. Role text
 *   under the name is an intentional ADDITION beyond the reference (which
 *   only showed a name) — kept for the extra clarity, doesn't conflict
 *   with anything the reference actually shows.
 * - Sign out: a distinct, always-visible button below the avatar row
 *   (matched — the reference shows this as its own element, not tucked
 *   inside a click-to-open menu). Edit Profile, no longer sharing a
 *   dropdown with Sign out, opens directly from clicking the avatar/name.
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

  const canViewLeads = can(user, "leads", "view");
  const isAdmin = user?.role === "admin";
  const { newLeadsCount, pendingLeaveCount } = useSidebarBadgeCounts({ canViewLeads, isAdmin });

  const menuItems = useMemo(() => {
    const allItems = [
      { key: ROUTE_PATHS.DASHBOARD, label: "Dashboard", icon: <DashboardOutlined />, show: true },
      {
        key: ROUTE_PATHS.LEADS,
        label: "Leads",
        icon: <RiseOutlined />,
        show: canViewLeads,
        // Count of leads with status "new", scoped the same way the Leads
        // list itself is (admin org-wide, manager team, sales_associate
        // own) — see `GET /leads/count` (§7.26).
        badgeCount: newLeadsCount,
      },
      {
        key: ROUTE_PATHS.CUSTOMERS,
        label: "Customers",
        icon: <TeamOutlined />,
        show: can(user, "customers", "view"),
      },
      {
        key: ROUTE_PATHS.PAYMENTS,
        label: "Payments",
        icon: <CreditCardOutlined />,
        show: user?.role === "admin",
      },
      { key: ROUTE_PATHS.ATTENDANCE, label: "Attendance", icon: <CalendarOutlined />, show: true },
      {
        key: ROUTE_PATHS.LEAVE,
        label: "Leave",
        icon: <FileDoneOutlined />,
        show: true,
        // Admin-only count of pending-approval leave requests (§7.26) — not
        // shown at all (not even a 0) to any non-admin role; `badgeCount`
        // stays 0 for them since `useSidebarBadgeCounts` never even fetches
        // it without `isAdmin`, but the `isAdmin` check here is what
        // actually prevents rendering the badge itself.
        badgeCount: isAdmin ? pendingLeaveCount : 0,
      },
      {
        key: ROUTE_PATHS.LOCATION,
        label: "Location",
        icon: <EnvironmentOutlined />,
        show:
          can(user, "location", "view") ||
          can(user, "location", "view_team") ||
          can(user, "location", "view_all"),
      },
      {
        key: ROUTE_PATHS.PAYROLL,
        label: "Payroll",
        icon: <WalletOutlined />,
        show: can(user, "payroll", "view") || can(user, "payroll", "run"),
      },
      { key: ROUTE_PATHS.TRAVEL_LOGS, label: "Travel Logs", icon: <CarOutlined />, show: true },
      {
        key: ROUTE_PATHS.TICKETS,
        label: "Tickets",
        icon: <CustomerServiceOutlined />,
        show: can(user, "tickets", "view_assigned") || can(user, "tickets", "view_all"),
      },
      {
        key: ROUTE_PATHS.AMC,
        label: "AMC",
        icon: <SafetyCertificateOutlined />,
        show: can(user, "amc", "view"),
      },
      { key: ROUTE_PATHS.REPORTS, label: "Reports", icon: <BarChartOutlined />, show: true },
    ];

    const items = allItems.filter((item) => item.show).map((item) => ({
      key: item.key,
      icon: item.icon,
      label: (
        <Link to={item.key} className="flex items-center justify-between">
          <span>{item.label}</span>
          {Boolean(item.badgeCount) && <Badge count={item.badgeCount} size="small" />}
        </Link>
      ),
    }));

    // Settings — a single flat nav item (no submenu/dropdown), linking
    // straight to the Users tab of the combined SettingsPage
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
  }, [user, canViewSettings, canViewLeads, isAdmin, newLeadsCount, pendingLeaveCount]);

  const allKnownKeys = useMemo(() => menuItems.map((item) => item.key), [menuItems]);

  const selectedKey = resolveSelectedKey(location.pathname, allKnownKeys);
  const selectedKeys = selectedKey ? [selectedKey] : [];

  async function handleLogout() {
    await logout();
    navigate(ROUTE_PATHS.LOGIN);
  }

  return (
    <Layout className="min-h-screen">
      {/*
        Fixed full-viewport sidebar. `insetInlineStart`/`insetInlineEnd` are
        the logical-property equivalents of left/right, matching AntD's own
        RTL-aware convention rather than hardcoding a direction. Background
        is set per-region below (white header, near-black nav+footer) —
        this outer element carries no background of its own so there's no
        flash of a third color between the two regions while the app
        mounts.
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
          zIndex: 10,
        }}
      >
        {/* Top — pinned, never scrolls. WHITE background (the one
            deliberate exception to the reference, which shows this
            section dark) — the color horizontal logo needs a light
            background for real contrast, an already-established decision
            from the immediately preceding tasks. `app-topbar-height`
            (styles/index.css) is the single shared height source with the
            blue top-bar strip below — they sit side by side and must stay
            pixel-equal; a previous mismatch (`h-14` vs `h-12`) came from
            hardcoding the same intended height as two independent
            Tailwind classes instead of one shared one. */}
        <div className="app-topbar-height flex shrink-0 items-center justify-center border-b border-gray-200 bg-white px-4">
          <BrandLogo className="w-32" variant="color" layout="horizontal" />
        </div>

        {/* Middle — the ONLY scrollable region, and only if the list is
            actually taller than the space left for it. `app-sidebar-scroll`
            (styles/index.css) hides the scrollbar completely — still
            scrollable via wheel/trackpad/keyboard, just no visible bar —
            for the rare genuinely-short-viewport case, see that class's
            own comment for the full history/reasoning. Near-black
            background matches the reference. */}
        <div className="app-sidebar-scroll app-sidebar-dark min-h-0 flex-1 overflow-y-auto">
          <Menu
            mode="inline"
            theme="dark"
            className="app-sidebar-menu !border-e-0"
            items={menuItems}
            selectedKeys={selectedKeys}
          />
        </div>

        {/* Bottom — pinned, never scrolls. Same near-black background as
            the nav list (a continuous dark region below the white header,
            matching the reference). Clicking the avatar/name opens Edit
            Profile directly; the gear icon is a second, always-visible
            entry point straight to Settings; "Sign out" is its own
            distinct, always-visible button below — matching the
            reference's own separate sign-out element rather than burying
            it in a click-to-open menu. */}
        <div className="app-sidebar-dark shrink-0 border-t border-white/10 p-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsEditProfileOpen(true)}
              className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md p-1.5 text-start hover:bg-white/10"
            >
              <Avatar icon={<UserOutlined />} size="small" className="!bg-brand-green" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-white">{user?.name}</div>
                <div className="truncate text-xs text-white/50">
                  {USER_ROLE_LABELS[user?.role] || user?.role}
                </div>
              </div>
            </button>
            {canViewSettings && (
              // `!text-white/60` (not plain `text-white/60`) — AntD's global
              // reset styles every bare `<a>` with `color: colorLink`
              // (brand-navy, per App.jsx's ConfigProvider) at a specificity
              // that otherwise wins over a plain Tailwind utility class, the
              // same gotcha already worked around elsewhere on AntD-styled
              // elements in this file (`!bg-brand-navy`, `!h-12`, etc.) —
              // without the `!`, this icon silently renders navy-on-navy,
              // exactly the low-contrast bug this fix addresses.
              <Link
                to={ROUTE_PATHS.SETTINGS_USERS}
                title="Settings"
                className="flex shrink-0 items-center justify-center rounded-md p-2 !text-white/60 hover:bg-white/10 hover:!text-white"
              >
                <SettingOutlined />
              </Link>
            )}
          </div>
          <Button
            block
            icon={<LogoutOutlined />}
            onClick={handleLogout}
            className="!mt-2 !border-white/15 !bg-transparent !text-white hover:!border-white/30 hover:!bg-white/10 hover:!text-white"
          >
            Sign out
          </Button>
        </div>
      </Sider>

      {/* Tailwind arbitrary value, not inline style — needs the responsive
          prefix so this margin drops to 0 below AntD's own `lg` Sider
          breakpoint (992px), where the Sider auto-collapses to width 0 and
          reserving 220px of empty margin would otherwise leave a dead gap. */}
      <Layout className="ms-0 lg:ms-[220px]">
        {/* Fixed full-width (minus sidebar) top bar — `inset-x-0` anchors
            both edges to the viewport, and the same `ms-0 lg:ms-[220px]`
            margin the Content column uses pushes its start edge in to clear
            the sidebar, so the two collapse/expand together at the same
            breakpoint rather than duplicating a hardcoded width. `z-10`
            matches the Sider's own z-index — they never overlap
            horizontally, but both need to sit above scrolling Content. */}
        <Header className="app-topbar-height !flex items-center justify-between !bg-brand-navy px-6 !leading-none fixed inset-x-0 top-0 z-10 ms-0 lg:ms-[220px]">
          <LiveClock />
          <NotificationBell />
        </Header>
        {/* `mt-16` (64px) replaces the header's old in-flow height (48px)
            plus this element's own original 1rem top margin — the header no
            longer occupies flow space now that it's fixed, so Content needs
            that space added back explicitly, or the page would render
            underneath it on initial load. */}
        <Content className="mx-4 mb-4 mt-16">
          {/* 100vh minus the top bar's 48px minus this Content's own 1rem
              top+bottom margin (unchanged from before — mt-16 already folds
              the top bar's height into that first 1rem, so the total
              vertical chrome is still exactly 5rem). */}
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
