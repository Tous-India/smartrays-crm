import { Router } from "express";
import authenticate from "../../middlewares/authenticate.middleware.js";
import { requireAdmin } from "../../middlewares/authorize.middleware.js";
import { request, list, approve, markAbsence } from "./leave.controller.js";
import { validateLeaveRequestInput, validateScopeQuery } from "./leave.validation.js";

const leaveRouter = Router();

// No module-permission gate — requesting your own leave is a self-service
// action, same reasoning as Attendance check-in/out (§7.4).
leaveRouter.post("/request", authenticate, validateLeaveRequestInput, request);

// Permission checked inside listLeaves per the requested ?scope=, not at the
// route level — each scope maps to its own leave.* action (view/view_team/
// view_all), so one authorize() call can't express all three ahead of time.
leaveRouter.get("/", authenticate, validateScopeQuery, list);

// Admin-only per §7.5 — "manager can view but not approve."
leaveRouter.patch("/:id/approve", authenticate, requireAdmin, approve);
leaveRouter.patch("/:id/mark-unapproved-absence", authenticate, requireAdmin, markAbsence);

export default leaveRouter;
