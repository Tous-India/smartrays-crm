import ApiError from "../../utils/ApiError.js";
import { PERMISSION_REGISTRY } from "../../constants/permissionRegistry.constants.js";
import { USER_ROLES } from "../user/user.model.js";

/**
 * Validates the :role route param used by the template endpoints.
 */
export function validateRoleParam(req, res, next) {
  const { role } = req.params;

  if (!USER_ROLES.includes(role)) {
    throw new ApiError(400, `Role must be one of: ${USER_ROLES.join(", ")}`);
  }

  next();
}

/**
 * Validates the body of any endpoint that sets a `permissions` object
 * (template edits and per-user overrides) against PERMISSION_REGISTRY —
 * every module key must be registered, every action key under it must be
 * one of that module's registered actions, and every value must be a
 * boolean. This is what makes the registry load-bearing rather than
 * decorative (.context/final-plan.md §7.12).
 */
export function validatePermissionsBody(req, res, next) {
  const { permissions } = req.body;

  if (!isPlainObject(permissions)) {
    throw new ApiError(400, "permissions must be an object");
  }

  Object.entries(permissions).forEach(([moduleName, actions]) => {
    const validActions = PERMISSION_REGISTRY[moduleName];

    if (!validActions) {
      throw new ApiError(400, `Unknown permission module: ${moduleName}`);
    }

    if (!isPlainObject(actions)) {
      throw new ApiError(400, `Permissions for module "${moduleName}" must be an object`);
    }

    Object.entries(actions).forEach(([action, value]) => {
      if (!validActions.includes(action)) {
        throw new ApiError(400, `Unknown permission action "${action}" for module "${moduleName}"`);
      }

      if (typeof value !== "boolean") {
        throw new ApiError(400, `Permission value for "${moduleName}.${action}" must be a boolean`);
      }
    });
  });

  next();
}

/**
 * `PATCH /users/:id/permissions` ONLY (§7.12c): on top of `validatePermissionsBody`,
 * the body must carry EVERY registry module. A partial body would make an
 * absent module indistinguishable from a deliberate "none" — and absence is
 * exactly what the boot-time backfill (`reconcileUserPermissions`) treats as
 * "never decided". The UI already sends every module with explicit booleans
 * (`selectionsToPermissions`); this makes a raw client do the same.
 *
 * Deliberately NOT applied to the template PATCH: templates are partial by
 * construction (code defaults list only the modules a role is granted) and
 * are the thing the backfill copies FROM, not a target of it.
 */
export function validateCompletePermissionsBody(req, res, next) {
  validatePermissionsBody(req, res, () => {
    const missing = Object.keys(PERMISSION_REGISTRY).filter((moduleName) => !(moduleName in req.body.permissions));

    if (missing.length > 0) {
      throw new ApiError(
        400,
        `permissions must carry every registry module — an omitted module cannot be told apart from a deliberate "none". Missing: ${missing.join(", ")}`
      );
    }

    next();
  });
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
