import { Router } from "express";
import authenticate from "../../middlewares/authenticate.middleware.js";
import { authorizeAny } from "../../middlewares/authorize.middleware.js";
import { create, live, history, config, recordConsent, myConsent, consentList, statusEvents, liveStatus, myStatus } from "./location.controller.js";
import { validatePingInput, validateHistoryQuery, validateConsentInput, validateStatusEventsInput } from "./location.validation.js";

const locationRouter = Router();

// No module-permission gate — submitting your own ping is a fact about your
// current shift, not a "view" action. Deliberate, see .context/final-plan.md §7.4b.
locationRouter.post("/pings", authenticate, validatePingInput, create);

const VIEW_ACTIONS = ["view", "view_team", "view_all"];

locationRouter.get("/live", authenticate, authorizeAny("location", VIEW_ACTIONS), live);
locationRouter.get(
  "/history",
  authenticate,
  authorizeAny("location", VIEW_ACTIONS),
  validateHistoryQuery,
  history
);

locationRouter.get("/config", authenticate, config);

// --- Live employee status (2026-10-23) ---
// Your own phone's "location off / on" and your own status: a session is enough.
locationRouter.post("/status-events", authenticate, validateStatusEventsInput, statusEvents);
locationRouter.get("/my-status", authenticate, myStatus);
// Everyone's: the live map's view grants, scoped by the same helper.
locationRouter.get("/live-status", authenticate, authorizeAny("location", VIEW_ACTIONS), liveStatus);

// --- Location consent (final-plan.md §7.73) ---
// Recording and reading your OWN decision needs only a session — like a ping,
// it is a fact about you. Seeing others' decisions follows the live map's
// view grants exactly, and is scoped by the same helper.
locationRouter.post("/consent", authenticate, validateConsentInput, recordConsent);
locationRouter.get("/consent/me", authenticate, myConsent);
locationRouter.get("/consent", authenticate, authorizeAny("location", VIEW_ACTIONS), consentList);

export default locationRouter;
