import { Router } from "express";
import authenticate from "../../middlewares/authenticate.middleware.js";
import { requireAdmin } from "../../middlewares/authorize.middleware.js";
import { request, list, approve, decline, markAbsence, balance, pendingCount } from "./leave.controller.js";
import { validateLeaveRequestInput, validateScopeQuery, validateDeclineInput } from "./leave.validation.js";

const leaveRouter = Router();

// No module-permission gate — requesting your own leave is a self-service
// action, same reasoning as Attendance check-in/out (§7.4).
leaveRouter.post("/request", authenticate, validateLeaveRequestInput, request);

// Permission checked inside listLeaves per the requested ?scope=, not at the
// route level — each scope maps to its own leave.* action (view/view_team/
// view_all), so one authorize() call can't express all three ahead of time.
leaveRouter.get("/", authenticate, validateScopeQuery, list);

// Own balance needs no gate at all (same "own data" precedent as
// GET /attendance/me); ?employeeId= for someone else is checked inside
// getLeaveBalance per-scope (view_team/view_all), not at the route level —
// same reasoning as GET / above.
leaveRouter.get("/balance", authenticate, balance);

// Sidebar badge (§7.26) — admin-only, hard role gate (see
// leave.service.js#getPendingLeaveCount for why this is `requireAdmin`, not
// authorize("leave", "view_all")). Registered before any "/:id" pattern so
// Express never matches "pending-count" as a leave id (moot today — this
// router has no "GET /:id" — but kept consistent with every other module's
// convention regardless).
leaveRouter.get("/pending-count", authenticate, requireAdmin, pendingCount);

// Admin-only per §7.5 — "manager can view but not approve."
leaveRouter.patch("/:id/approve", authenticate, requireAdmin, approve);
leaveRouter.patch("/:id/decline", authenticate, requireAdmin, validateDeclineInput, decline);
leaveRouter.patch("/:id/mark-unapproved-absence", authenticate, requireAdmin, markAbsence);

export default leaveRouter;
