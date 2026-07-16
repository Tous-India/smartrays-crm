import { Router } from "express";
import authenticate from "../../middlewares/authenticate.middleware.js";
import { authorizeAny } from "../../middlewares/authorize.middleware.js";
import { create, list, report, approve, reject } from "./travelLog.controller.js";
import {
  validateManualEntryInput,
  validateListQuery,
  validateReportQuery,
} from "./travelLog.validation.js";

const travelLogRouter = Router();

// No module-permission gate — logging your own travel is a self-service
// action, same reasoning as Attendance check-in/out and Leave's request
// endpoint. Logging on behalf of someone else (manager for a direct report,
// admin for anyone) is a structural relationship check inside the service,
// not a `can()` permission tier.
travelLogRouter.post("/", authenticate, validateManualEntryInput, create);

// Permission checked inside listTravelLogs per the requested ?scope=, not at
// the route level — same reasoning as GET /leave (each scope maps to its own
// travelLogs.* action).
travelLogRouter.get("/", authenticate, validateListQuery, list);

const VIEW_ACTIONS = ["view_team", "view_all"];
travelLogRouter.get(
  "/report",
  authenticate,
  authorizeAny("travelLogs", VIEW_ACTIONS),
  validateReportQuery,
  report
);

// Authenticate-only at the route level, same as POST / above — "manager of
// that employee, or admin" is a structural relationship check enforced inside
// the service, not a `can()` permission tier.
travelLogRouter.patch("/:id/approve", authenticate, approve);
travelLogRouter.patch("/:id/reject", authenticate, reject);

export default travelLogRouter;
