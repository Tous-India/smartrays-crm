import { Link } from "react-router-dom";
import { Avatar, Button, Dropdown, Tooltip } from "antd";
import { SettingOutlined, LogoutOutlined, UserOutlined } from "@ant-design/icons";
import NotificationBell from "../modules/notification/components/NotificationBell";
import { ROUTE_PATHS } from "../constants/routePaths.constants";
import { USER_ROLE_LABELS } from "../modules/user/constants/user.constants";

/**
 * User controls in the fixed top strip (2026-08-05) — moved out of the left
 * sidebar's footer, in the order [bell] [gear] [name] [sign out].
 *
 * The bell is the SAME `NotificationBell` instance that used to sit here
 * alone — relocated, not rebuilt — so its polling and visibilitychange
 * refetch (in `useNotifications`) are untouched.
 *
 * **Responsive (§4):** below `sm` the name and Sign out collapse into an
 * avatar dropdown, because at 390px the full row plus the attendance
 * controls would otherwise overflow the strip. The same actions stay
 * reachable, just one tap deeper — nothing is dropped and the header never
 * scrolls horizontally.
 */
function HeaderUserControls({ user, canViewSettings, onSignOut, onEditProfile }) {
  const roleLabel = USER_ROLE_LABELS[user?.role] || user?.role;

  const collapsedMenu = {
    items: [
      { key: "who", label: <span className="font-medium">{user?.name}</span>, disabled: true },
      { key: "role", label: <span className="text-xs text-gray-500">{roleLabel}</span>, disabled: true },
      { type: "divider" },
      { key: "profile", label: "Edit profile", onClick: onEditProfile },
      ...(canViewSettings
        ? [{ type: "divider" }, { key: "settings", label: <Link to={ROUTE_PATHS.SETTINGS_USERS}>Settings</Link> }]
        : []),
      { type: "divider" },
      { key: "signout", label: "Sign out", danger: true, onClick: onSignOut },
    ],
  };

  return (
    <div className="flex items-center gap-2">
      <NotificationBell />

      {canViewSettings && (
        <Tooltip title="Settings">
          {/* `!text-white/70` — AntD's global reset styles a bare <a> with
              colorLink (brand navy), which beats a plain utility class and
              would render this navy-on-navy. Same gotcha the sidebar's own
              gear icon already worked around. */}
          <Link
            to={ROUTE_PATHS.SETTINGS_USERS}
            aria-label="Settings"
            className="hidden items-center justify-center rounded-md p-1.5 !text-white/70 hover:bg-white/10 hover:!text-white sm:flex"
          >
            <SettingOutlined />
          </Link>
        </Tooltip>
      )}

      {/* Full name + role, from `sm` up. Clicking it opens Edit Profile —
          the sidebar avatar used to be that entry point, and removing the
          footer would otherwise have stranded the modal with no way in. */}
      <Tooltip title="Edit profile">
        <button
          type="button"
          onClick={onEditProfile}
          aria-label="Edit profile"
          className="hidden cursor-pointer flex-col items-start rounded-md px-2 py-1 leading-tight hover:bg-white/10 sm:flex"
        >
          <span className="text-sm font-medium text-white">{user?.name}</span>
          <span className="text-xs text-white/50">{roleLabel}</span>
        </button>
      </Tooltip>

      <Button
        size="small"
        icon={<LogoutOutlined />}
        onClick={onSignOut}
        className="!hidden !border-white/20 !bg-transparent !text-white hover:!border-white/40 hover:!bg-white/10 hover:!text-white sm:!inline-flex"
      >
        Sign out
      </Button>

      {/* Collapsed equivalent, below `sm` only. */}
      <Dropdown menu={collapsedMenu} trigger={["click"]} placement="bottomRight">
        <button type="button" aria-label="Account menu" className="flex sm:hidden">
          <Avatar size="small" icon={<UserOutlined />} className="!bg-brand-green" />
        </button>
      </Dropdown>
    </div>
  );
}

export default HeaderUserControls;
