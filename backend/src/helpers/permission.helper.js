/**
 * Checks whether a user is allowed to perform an action on a module.
 *
 * Admins always pass. Everyone else needs an explicit true value at
 * user.permissions[module][action] (see final-plan.md §5 for the permission matrix
 * this data shape supports).
 *
 * @param {object} user - the authenticated user document (or null if not logged in)
 * @param {string} module - permission module name, e.g. "leads"
 * @param {string} action - permission action name, e.g. "view"
 * @returns {boolean}
 */
export function can(user, module, action) {
  if (!user) {
    return false;
  }

  if (user.role === "admin") {
    return true;
  }

  const modulePermissions = user.permissions ? user.permissions[module] : null;

  if (!modulePermissions) {
    return false;
  }

  return modulePermissions[action] === true;
}
