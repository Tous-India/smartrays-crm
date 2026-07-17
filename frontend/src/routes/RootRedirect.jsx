import { Navigate } from "react-router-dom";
import useSessionStore from "../store/sessionStore";
import { ROUTE_PATHS } from "../constants/routePaths.constants";

/**
 * `/`'s real redirect-by-role logic (§8): a `customer` account goes to the
 * separate Customer Portal; every staff role (admin/manager/sales_associate/
 * employee) goes to the shared dashboard shell (§7.13). Rendered under
 * `ProtectedRoute`, so by the time this runs `user` is always populated.
 */
function RootRedirect() {
  const user = useSessionStore((state) => state.user);

  if (user?.role === "customer") {
    return <Navigate to={ROUTE_PATHS.PORTAL} replace />;
  }

  return <Navigate to={ROUTE_PATHS.DASHBOARD} replace />;
}

export default RootRedirect;
