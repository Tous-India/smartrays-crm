import { Router } from "express";
import authenticate from "../../middlewares/authenticate.middleware.js";
import { authorizeAny } from "../../middlewares/authorize.middleware.js";
import { create, live, history, config, recordConsent, myConsent, consentList } from "./location.controller.js";
import { validatePingInput, validateHistoryQuery, validateConsentInput } from "./location.validation.js";

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

// --- Location consent (final-plan.md §7.73) ---
// Recording and reading your OWN decision needs only a session — like a ping,
// it is a fact about you. Seeing others' decisions follows the live map's
// view grants exactly, and is scoped by the same helper.
locationRouter.post("/consent", authenticate, validateConsentInput, recordConsent);
locationRouter.get("/consent/me", authenticate, myConsent);
locationRouter.get("/consent", authenticate, authorizeAny("location", VIEW_ACTIONS), consentList);

export default locationRouter;
