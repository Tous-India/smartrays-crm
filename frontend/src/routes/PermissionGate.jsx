import useSessionStore from "../store/sessionStore";
import { can } from "../utils/permission.utils";

/**
 * UI CONVENIENCE ONLY — NOT A SECURITY BOUNDARY.
 *
 * Hides or shows children based on the CURRENT user's permissions, mirroring
 * the backend's `can(user, module, action)`. The backend already enforces
 * every real permission check on every request (§4.1) — this component only
 * decides what appears in the UI. A user could still hit the API directly
 * and get a real 403; this just avoids showing them a button that would
 * fail if they clicked it.
 *
 * Usage: <PermissionGate module="leads" action="delete"><DeleteButton /></PermissionGate>
 */
function PermissionGate({ module, action, fallback = null, children }) {
  const user = useSessionStore((state) => state.user);

  if (!can(user, module, action)) {
    return fallback;
  }

  return children;
}

export default PermissionGate;
