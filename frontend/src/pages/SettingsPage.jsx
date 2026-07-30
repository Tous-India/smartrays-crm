import { Tabs, Result } from "antd";
import { useLocation, useNavigate } from "react-router-dom";
import useSessionStore from "../store/sessionStore";
import { can } from "../utils/permission.utils";
import { ROUTE_PATHS } from "../constants/routePaths.constants";
import UserManagementPage from "../modules/user/components/UserManagementPage";
import TeamManagementPage from "../modules/team/components/TeamManagementPage";
import PermissionManagementPage from "../modules/permission/components/PermissionManagementPage";

/**
 * `/settings/users` and `/settings/permissions` both render this one page —
 * User Management and Permissions are tabs on a single Settings page rather
 * than two routes reached via a sidebar submenu (§ sidebar redesign,
 * replacing the earlier collapsible-submenu approach). The URL itself still
 * deep-links to a specific tab (`activeKey` derived from the current path,
 * `onChange` navigates) — only the SIDEBAR interaction changed, not the
 * route map.
 */
function SettingsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const user = useSessionStore((state) => state.user);

  const canViewUsers = can(user, "users", "view_all") || can(user, "users", "view_team");
  const canManagePermissions = can(user, "permissions", "manage");
  const canManageTeams = can(user, "teams", "manage");

  const items = [
    canViewUsers && {
      key: ROUTE_PATHS.SETTINGS_USERS,
      label: "User Management",
      children: <UserManagementPage />,
    },
    canManageTeams && {
      key: ROUTE_PATHS.SETTINGS_TEAMS,
      label: "Teams",
      children: <TeamManagementPage />,
    },
    canManagePermissions && {
      key: ROUTE_PATHS.SETTINGS_PERMISSIONS,
      label: "Permissions",
      children: <PermissionManagementPage />,
    },
  ].filter(Boolean);

  if (items.length === 0) {
    return (
      <Result status="403" title="Not authorized" subTitle="You do not have permission to view Settings." />
    );
  }

  // Falls back to whichever tab IS visible when the current path doesn't
  // match any rendered tab's key (e.g. a stale bookmark/link to a tab this
  // particular user no longer holds the grant for) — AntD's `Tabs` renders
  // blank content for an `activeKey` with no matching item otherwise.
  const activeKey = items.some((item) => item.key === location.pathname)
    ? location.pathname
    : items[0].key;

  return <Tabs activeKey={activeKey} onChange={(key) => navigate(key)} items={items} />;
}

export default SettingsPage;
