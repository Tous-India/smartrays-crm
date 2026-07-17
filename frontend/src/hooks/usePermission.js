import useSessionStore from "../store/sessionStore";
import { can } from "../utils/permission.utils";

/**
 * UI CONVENIENCE ONLY — NOT A SECURITY BOUNDARY, same caveat as
 * `PermissionGate` (see that file). Use this when a permission check needs
 * to drive logic rather than conditionally render JSX (e.g. disabling a
 * button instead of hiding it, or an early return inside an event handler).
 *
 * Usage: const canDeleteLead = usePermission("leads", "delete");
 */
export function usePermission(module, action) {
  const user = useSessionStore((state) => state.user);

  return can(user, module, action);
}
