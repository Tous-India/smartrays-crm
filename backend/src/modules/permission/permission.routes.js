import { Router } from "express";
import authenticate from "../../middlewares/authenticate.middleware.js";
import { authorize } from "../../middlewares/authorize.middleware.js";
import {
  registry,
  listAllTemplates,
  getTemplate,
  editTemplate,
  getUserPerms,
  editUserPerms,
  resetUserPerms,
} from "./permission.controller.js";
import { validateRoleParam, validatePermissionsBody } from "./permission.validation.js";

// Gated by permissions.manage (can()-backed) rather than requireAdmin — even
// though only an admin will ever hold this grant today, using the same
// mechanism as every other module keeps this one self-consistent instead of
// a special case. See .context/final-plan.md §7.12.
const manage = authorize("permissions", "manage");

const permissionRouter = Router();

permissionRouter.get("/registry", authenticate, manage, registry);
permissionRouter.get("/templates", authenticate, manage, listAllTemplates);
permissionRouter.get("/templates/:role", authenticate, manage, validateRoleParam, getTemplate);
permissionRouter.patch(
  "/templates/:role",
  authenticate,
  manage,
  validateRoleParam,
  validatePermissionsBody,
  editTemplate
);

export default permissionRouter;

// Mounted at /users in route.js — a user's own permissions are already
// visible via GET /auth/me (§7.0); this router is for an admin managing
// someone else's.
const userPermissionRouter = Router();

userPermissionRouter.get("/:id/permissions", authenticate, manage, getUserPerms);
userPermissionRouter.patch(
  "/:id/permissions",
  authenticate,
  manage,
  validatePermissionsBody,
  editUserPerms
);
userPermissionRouter.post("/:id/permissions/reset", authenticate, manage, resetUserPerms);

export { userPermissionRouter };
