import { Router } from "express";
import authenticate from "../../middlewares/authenticate.middleware.js";
import { authorize, requireAdmin } from "../../middlewares/authorize.middleware.js";
import { request, list, approve, decline, markAbsence, remove, balance, pendingCount } from "./leave.controller.js";
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

// Manager parity (§7.5c, 2026-07-31 — reverses the earlier "admin-only, full
// stop" restriction from §7.5). `authorize()` checks the caller holds SOME
// grant for the action (admin always does, via can()'s own admin bypass; a
// manager needs the new leave.approve/decline/mark_unapproved_absence
// default grant) — the actual own-team-vs-someone-else's-team scoping is
// resolved inside leave.service.js#ensureCanActOnLeave, which needs to look
// up the specific record's employee to answer that, not something route-
// level middleware alone can express.
leaveRouter.patch("/:id/approve", authenticate, authorize("leave", "approve"), approve);
leaveRouter.patch(
  "/:id/decline",
  authenticate,
  authorize("leave", "decline"),
  validateDeclineInput,
  decline
);
leaveRouter.patch(
  "/:id/mark-unapproved-absence",
  authenticate,
  authorize("leave", "mark_unapproved_absence"),
  markAbsence
);

// §7.5d, 2026-07-31 — same scoping split as the three actions above (route
// confirms SOME grant, leave.service.js#ensureCanActOnLeave resolves the
// specific record's team scope). A hard delete, not a status change.
leaveRouter.delete("/:id", authenticate, authorize("leave", "delete"), remove);

export default leaveRouter;
