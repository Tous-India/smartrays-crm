/**
 * Mirrors the backend's `can(user, module, action)` helper
 * (`backend/src/helpers/permission.helper.js`) exactly, for UI purposes only.
 *
 * IMPORTANT: this is NOT a security boundary. It only decides what to show
 * or hide in the UI for a better experience — the backend re-checks every
 * permission for real on every request (§4.1, single source of truth for
 * auth). Hiding a button here never actually stops a determined client from
 * calling the API directly; only the backend's own `can()`/`authorize()`
 * middleware does that.
 */
export function can(user, module, action) {
  if (!user) {
    return false;
  }

  if (user.role === "admin") {
    return true;
  }

  return user.permissions?.[module]?.[action] === true;
}
