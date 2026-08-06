import { useEffect, useMemo, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Layout, Menu, Badge } from "antd";
import {
  SettingOutlined,
  DashboardOutlined,
  RiseOutlined,
  TeamOutlined,
  CalendarOutlined,
  FileDoneOutlined,
  WalletOutlined,
  CarOutlined,
  CustomerServiceOutlined,
  CreditCardOutlined,
  BarChartOutlined,
  IdcardOutlined,
} from "@ant-design/icons";
import useSessionStore from "../store/sessionStore";
import { can } from "../utils/permission.utils";
import useSidebarBadgeCounts from "../hooks/useSidebarBadgeCounts";
import { ROUTE_PATHS } from "../constants/routePaths.constants";
import { USER_ROLE_LABELS } from "../modules/user/constants/user.constants";
import BrandLogo from "../components/BrandLogo";
import EditProfileModal from "../modules/user/components/EditProfileModal";
import LiveClock from "./LiveClock";
import HeaderAttendanceControl from "./HeaderAttendanceControl";
import HeaderUserControls from "./HeaderUserControls";

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

  // Mobile hamburger/drawer state — lifted up from `Sider`'s own default
  // uncontrolled `collapsed` state (an AntD `Sider` with `breakpoint="lg"`
  // and `collapsedWidth="0"` manages this internally otherwise) so a route
  // change can force it closed below. `isMobileViewport` mirrors the
  // Sider's own internal `below` flag via `onBreakpoint`, so the
  // auto-close effect only ever fires on a mobile-width viewport — without
  // it, forcing `collapsed` to `true` on every navigation would also
  // collapse the full desktop sidebar to width 0 on every route change.
  const [collapsed, setCollapsed] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);

  useEffect(() => {
    if (isMobileViewport) {
      setCollapsed(true);
    }
    // Watches `location.pathname` specifically (not the whole `location`
    // object) so this only fires on a real route change, not on every
    // search-param/hash update within the same page — covers nav-link
    // taps, browser back/forward, and programmatic `navigate()` calls
    // alike, since all of them update `location.pathname` the same way.
  }, [location.pathname, isMobileViewport]);

  const canViewSettings = useMemo(() => {
    // Every signed-in user reaches Settings now — it holds their own Account
    // (2FA, password) and, for an employee, their read-only permissions.
    // Which TABS appear inside is still permission-gated (SettingsPage).
    return true;
  }, [user]);

  const canViewLeads = can(user, "leads", "view");
  // Employees get a narrower, self-service nav (§7.39); every other role's
  // nav is untouched.
  const isEmployee = user?.role === "employee";
  const { newLeadsCount, pendingLeaveCount, clearLeadsBadge, clearLeaveBadge } = useSidebarBadgeCounts({
    canViewLeads,
  });

  const menuItems = useMemo(() => {
    const allItems = [
      { key: ROUTE_PATHS.DASHBOARD, label: "Dashboard", icon: <DashboardOutlined />, show: true },
      {
        key: ROUTE_PATHS.LEADS,
        label: "Leads",
        icon: <RiseOutlined />,
        show: canViewLeads,
        // Unread `lead_created`/`lead_assigned` notification count (§7.29 —
        // replaces the earlier `GET /leads/count` record-count approach,
        // §7.26, with the Notification module itself as the source of
        // truth). Clicking this nav item marks those types read.
        badgeCount: newLeadsCount,
        onNavigate: clearLeadsBadge,
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
      {
        key: ROUTE_PATHS.ATTENDANCE,
        label: "Attendance",
        icon: <CalendarOutlined />,
        show: true,
        // Leave lives inside /attendance as of 2026-08-05, so its unread
        // badge moved onto this item with it rather than being dropped
        // along with the retired /leave nav entry.
        badgeCount: pendingLeaveCount,
        onNavigate: clearLeaveBadge,
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
      { key: ROUTE_PATHS.REPORTS, label: "Reports", icon: <BarChartOutlined />, show: true },
      // §7.39 (2026-08-05) — employee-only destinations. Leave is its own
      // page for this role (it's a tab inside Attendance for admin/manager),
      // and Team/Profile have no admin equivalent.
      { key: ROUTE_PATHS.LEAVE, label: "Leave", icon: <FileDoneOutlined />, show: isEmployee },
      { key: ROUTE_PATHS.TEAM, label: "Team", icon: <TeamOutlined />, show: isEmployee },
      { key: ROUTE_PATHS.PROFILE, label: "Profile", icon: <IdcardOutlined />, show: isEmployee },
    ];

    const items = allItems.filter((item) => item.show).map((item) => ({
      key: item.key,
      icon: item.icon,
      label: (
        <Link to={item.key} className="flex items-center justify-between" onClick={item.onNavigate}>
          <span>{item.label}</span>
          {Boolean(item.badgeCount) && <Badge count={item.badgeCount} size="small" className="mx-1.25" />}
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
        label: <Link to={isEmployee ? ROUTE_PATHS.SETTINGS_ACCOUNT : ROUTE_PATHS.SETTINGS_USERS}>Settings</Link>,
      });
    }

    return items;
  }, [user, canViewSettings, canViewLeads, newLeadsCount, pendingLeaveCount, clearLeadsBadge, clearLeaveBadge]);

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
        collapsed={collapsed}
        onCollapse={setCollapsed}
        onBreakpoint={setIsMobileViewport}
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

        {/* The sidebar footer (avatar / name / gear / Sign out) moved to
            the fixed top strip on 2026-08-05 — see `HeaderUserControls`.
            Nothing replaces it here: the nav list simply runs to the bottom
            of the column now. */}
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
        <Header className="app-topbar-height !flex items-center justify-between !bg-brand-navy px-4 !leading-none fixed inset-x-0 top-0 z-10 ms-0 lg:ms-[220px] sm:px-6">
          <LiveClock />
          <div className="flex items-center gap-3">
            {/* Admin is exempt from attendance entirely (§7.4c) — gating
                here means the control isn't even mounted for that role, so
                no `GET /attendance/me` fires. The user controls beside it
                still render for everyone. */}
            {user?.role !== "admin" && <HeaderAttendanceControl />}
            <HeaderUserControls
              user={user}
              canViewSettings={canViewSettings}
              onSignOut={handleLogout}
              onEditProfile={() => setIsEditProfileOpen(true)}
            />
          </div>
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
