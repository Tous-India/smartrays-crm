import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Spin } from "antd";
import useSessionStore from "../store/sessionStore";
import { ROUTE_PATHS } from "../constants/routePaths.constants";

/**
 * Redirects to /login if the session store has no authenticated user. Shows
 * a loading state while the initial `GET /auth/me` call (fired once on app
 * load, see App.jsx) is still in flight, so an already-logged-in user never
 * sees a flash of the login page before the real check completes.
 */
function ProtectedRoute() {
  const isAuthenticated = useSessionStore((state) => state.isAuthenticated);
  const isLoading = useSessionStore((state) => state.isLoading);
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <Spin size="large" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to={ROUTE_PATHS.LOGIN} state={{ from: location }} replace />;
  }

  return <Outlet />;
}

export default ProtectedRoute;
