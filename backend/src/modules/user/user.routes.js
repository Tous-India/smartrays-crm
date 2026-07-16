import { Router } from "express";
import authenticate from "../../middlewares/authenticate.middleware.js";
import { requireAdmin } from "../../middlewares/authorize.middleware.js";
import { list, dropdown, getOne, update, deactivate, reactivate, changeManager } from "./user.controller.js";
import { validateUpdateUserInput, validateAssignManagerInput } from "./user.validation.js";

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
userRouter.patch("/:id/deactivate", authenticate, requireAdmin, deactivate);
userRouter.patch("/:id/reactivate", authenticate, requireAdmin, reactivate);
userRouter.patch("/:id/manager", authenticate, requireAdmin, validateAssignManagerInput, changeManager);

export default userRouter;
