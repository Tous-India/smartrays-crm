import { useMemo } from "react";
import { Link, Outlet, useNavigate } from "react-router-dom";
import { Layout, Menu, Avatar, Dropdown } from "antd";
import { UserOutlined, LogoutOutlined } from "@ant-design/icons";
import useSessionStore from "../store/sessionStore";
import { can } from "../utils/permission.utils";
import { ROUTE_PATHS } from "../constants/routePaths.constants";
import BrandLogo from "../components/BrandLogo";

const { Header, Sider, Content } = Layout;

/**
 * The one dashboard shell every non-customer role shares, per §7.13 —
 * composes its nav items by role + permission rather than branching into
 * separate Admin/Manager/Sales/Employee layouts. Each nav item is filtered
 * with the same `can()` check `PermissionGate` uses, so the menu itself
 * never shows a link the user has no grant for (UI convenience only — the
 * backend still enforces the real access check on every request).
 */
function MainLayout() {
  const user = useSessionStore((state) => state.user);
  const logout = useSessionStore((state) => state.logout);
  const navigate = useNavigate();

  const menuItems = useMemo(() => {
    const allItems = [
      { key: ROUTE_PATHS.DASHBOARD, label: "Dashboard", show: true },
      { key: ROUTE_PATHS.LEADS, label: "Leads", show: can(user, "leads", "view") },
      { key: ROUTE_PATHS.CUSTOMERS, label: "Customers", show: can(user, "customers", "view") },
      { key: ROUTE_PATHS.TASKS, label: "Tasks", show: can(user, "tasks", "view") },
      { key: ROUTE_PATHS.ATTENDANCE, label: "Attendance", show: true },
      { key: ROUTE_PATHS.LEAVE, label: "Leave", show: true },
      {
        key: ROUTE_PATHS.PAYROLL,
        label: "Payroll",
        show: can(user, "payroll", "view") || can(user, "payroll", "run"),
      },
      { key: ROUTE_PATHS.TRAVEL_LOGS, label: "Travel Logs", show: true },
      { key: ROUTE_PATHS.TICKETS, label: "Tickets", show: can(user, "tickets", "view_assigned") || can(user, "tickets", "view_all") },
      { key: ROUTE_PATHS.PAYMENTS, label: "Payments", show: user?.role === "admin" },
      { key: ROUTE_PATHS.AMC, label: "AMC", show: can(user, "amc", "view") },
      { key: ROUTE_PATHS.REPORTS, label: "Reports", show: true },
      {
        key: ROUTE_PATHS.SETTINGS_PERMISSIONS,
        label: "Permission Settings",
        show: can(user, "permissions", "manage"),
      },
    ];

    return allItems
      .filter((item) => item.show)
      .map((item) => ({ key: item.key, label: <Link to={item.key}>{item.label}</Link> }));
  }, [user]);

  async function handleLogout() {
    await logout();
    navigate(ROUTE_PATHS.LOGIN);
  }

  const userMenuItems = [
    {
      key: "logout",
      label: "Log out",
      icon: <LogoutOutlined />,
      onClick: handleLogout,
    },
  ];

  return (
    <Layout className="min-h-screen">
      {/* White nav with the navy logo, per the brand reference (smartrayssolutions.com's
          "white nav with navy text") — the top Header below carries the solid navy bar. */}
      <Sider breakpoint="lg" collapsedWidth="0" theme="light">
        <div className="flex h-16 items-center justify-center border-b border-gray-100 px-4">
          <BrandLogo className="w-24" />
        </div>
        <Menu mode="inline" theme="light" items={menuItems} />
      </Sider>
      <Layout>
        <Header className="flex items-center justify-end !bg-brand-navy px-6">
          <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
            <div className="flex cursor-pointer items-center gap-2 text-white">
              <Avatar icon={<UserOutlined />} />
              <span>{user?.name}</span>
            </div>
          </Dropdown>
        </Header>
        <Content className="m-4">
          <div className="min-h-[calc(100vh-8rem)] rounded-lg bg-white p-6">
            <Outlet />
          </div>
        </Content>
      </Layout>
    </Layout>
  );
}

export default MainLayout;
