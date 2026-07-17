import { Outlet, useNavigate } from "react-router-dom";
import { Layout, Button } from "antd";
import useSessionStore from "../store/sessionStore";
import { ROUTE_PATHS } from "../constants/routePaths.constants";

const { Header, Content } = Layout;

/**
 * A separate, distinct layout for `role: customer` accounts, per §8: "no
 * internal nav" — the Customer Portal is a narrow, single-purpose surface
 * (raise/view tickets), not the full multi-module dashboard shell every
 * staff role gets via MainLayout.
 */
function PortalLayout() {
  const user = useSessionStore((state) => state.user);
  const logout = useSessionStore((state) => state.logout);
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate(ROUTE_PATHS.LOGIN);
  }

  return (
    <Layout className="min-h-screen">
      <Header className="flex items-center justify-between !bg-white px-6">
        <span className="text-lg font-semibold">Smartrays Customer Portal</span>
        <div className="flex items-center gap-4">
          <span>{user?.name}</span>
          <Button onClick={handleLogout}>Log out</Button>
        </div>
      </Header>
      <Content className="m-4">
        <div className="min-h-[calc(100vh-8rem)] rounded-lg bg-white p-6">
          <Outlet />
        </div>
      </Content>
    </Layout>
  );
}

export default PortalLayout;
