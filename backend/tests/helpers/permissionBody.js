import { PERMISSION_REGISTRY } from "../../src/constants/permissionRegistry.constants.js";

/**
 * Builds the body the Permissions UI actually sends (§7.12c): EVERY registry
 * module, EVERY action, explicit `true`/`false`. `overrides` flips the named
 * actions on. This is the shape `PATCH /users/:id/permissions` now requires —
 * a partial body would make an absent module indistinguishable from a
 * deliberate "none" and silently re-eligible for the boot-time backfill.
 *
 * Mirrors `frontend/src/modules/permission/permissionModel.js
 * #selectionsToPermissions`, which is the invariant the backfill relies on.
 */
export function completePermissions(overrides = {}) {
  const body = {};

  for (const [moduleName, actions] of Object.entries(PERMISSION_REGISTRY)) {
    body[moduleName] = {};

    for (const action of actions) {
      body[moduleName][action] = Boolean(overrides[moduleName]?.[action]);
    }
  }

  return body;
}
