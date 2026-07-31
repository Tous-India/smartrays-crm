import { Router } from "express";
import authenticate from "../../middlewares/authenticate.middleware.js";
import { requireAdmin } from "../../middlewares/authorize.middleware.js";
import {
  list,
  dropdown,
  getOne,
  update,
  deactivate,
  deactivationImpact,
  reactivate,
  changeManager,
  resetPassword,
  hardDelete,
} from "./user.controller.js";
import {
  validateUpdateUserInput,
  validateAssignManagerInput,
  validateAdminResetPasswordInput,
} from "./user.validation.js";

const userRouter = Router();

// Registered before "/:id" so "dropdown" is never matched as a user id.
// Not permission-gated — low-sensitivity picker data, same reasoning as
// GET /lead-sources (§7.1).
userRouter.get("/dropdown", authenticate, dropdown);

// No route-level permission gate on the list either — a caller with no
// users.* grant still gets a valid list back, scoped down to just themselves
// by user.service.js#resolveVisibleUserFilter's fallbackToSelf. Broader
// scoping (view_team/view_all) is still resolved entirely in the service.
userRouter.get("/", authenticate, list);

// No route-level permission gate — self-access is always allowed regardless
// of any users.* grant (service resolves self vs. scoped vs. denied).
userRouter.get("/:id", authenticate, getOne);
userRouter.patch("/:id", authenticate, validateUpdateUserInput, update);

// Account-lifecycle actions are requireAdmin, matching how account creation
// (POST /auth/register) is gated — a plain role check, not a can() module
// permission, since these aren't "view" tiers a manager could partially hold.
//
// Checked before the deactivate itself (§7.31) — the frontend calls this
// first to know whether to show the reassignment modal at all, but nothing
// stops an admin calling `PATCH /:id/deactivate` directly without ever
// checking impact first; the deactivate endpoint re-validates everything
// itself regardless (`setUserActiveStatus`), this is purely informational.
userRouter.get("/:id/deactivation-impact", authenticate, requireAdmin, deactivationImpact);
userRouter.patch("/:id/deactivate", authenticate, requireAdmin, deactivate);
userRouter.patch("/:id/reactivate", authenticate, requireAdmin, reactivate);
userRouter.patch("/:id/manager", authenticate, requireAdmin, validateAssignManagerInput, changeManager);
userRouter.patch(
  "/:id/reset-password",
  authenticate,
  requireAdmin,
  validateAdminResetPasswordInput,
  resetPassword
);

// Guarded, permanent hard-delete (§7.28) — admin only, same gate as the
// other account-lifecycle actions above. All the real guards (active-status,
// team-head, reason-required) live in user.service.js#hardDeleteUser so
// their rejection order is exact and unit-testable, not split across a
// validation middleware and the service.
userRouter.delete("/:id", authenticate, requireAdmin, hardDelete);

export default userRouter;
