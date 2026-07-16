import ApiError from "../utils/ApiError.js";
import { can } from "../helpers/permission.helper.js";

/**
 * Generic permission gate for the 13 feature modules (leads, customers, ...).
 * Must run after authenticate() so req.user is set.
 *
 * Usage: router.get("/leads", authenticate, authorize("leads", "view"), listLeads)
 */
export function authorize(module, action) {
  return function authorizeMiddleware(req, res, next) {
    const isAllowed = can(req.user, module, action);

    if (!isAllowed) {
      throw new ApiError(403, "You do not have permission to perform this action");
    }

    next();
  };
}

/**
 * Permission gate for modules with more than one viewing tier (e.g. Location
 * Tracking's view/view_team/view_all, §7.4b) — passes if the user holds ANY of
 * the given actions. Which specific tier(s) they hold still has to be resolved
 * inside the service layer to build the actual visible-record scope; this
 * middleware only answers "are they allowed in the door at all."
 *
 * Usage: router.get("/live", authenticate, authorizeAny("location", ["view", "view_team", "view_all"]), live)
 */
export function authorizeAny(module, actions) {
  return function authorizeAnyMiddleware(req, res, next) {
    const isAllowed = actions.some((action) => can(req.user, module, action));

    if (!isAllowed) {
      throw new ApiError(403, "You do not have permission to perform this action");
    }

    next();
  };
}

/**
 * Simple role gate for admin-only actions that are not part of the
 * module/action permission matrix (e.g. creating user accounts).
 */
export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    throw new ApiError(403, "Only an admin can perform this action");
  }

  next();
}
