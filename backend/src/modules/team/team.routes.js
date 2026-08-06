import { Router } from "express";
import authenticate from "../../middlewares/authenticate.middleware.js";
import { authorize, authorizeAny } from "../../middlewares/authorize.middleware.js";
import {
  list,
  getOne,
  create,
  update,
  remove,
  getMembers,
  addMember,
  removeMember,
  listTypes,
  createType,
  updateType,
  toggleShowContacts,
} from "./team.controller.js";
import {
  validateCreateTeamInput,
  validateUpdateTeamInput,
  validateAddMemberInput,
  validateCreateTeamTypeInput,
  validateUpdateTeamTypeInput,
} from "./team.validation.js";

// Gated by teams.manage (can()-backed) rather than requireAdmin — same
// reasoning as the Permissions module's own `manage` tier
// (permission.routes.js): only an admin holds this grant today, but using
// the same can()-backed mechanism as every other module keeps Team
// consistent rather than a one-off hardcoded role check.
const manage = authorize("teams", "manage");

// Read-only tier (2026-08-05) — `authorize` here only confirms the caller
// holds SOME team-read grant; WHICH teams they actually see is resolved in
// team.service.js against `headManagerId`, the same "route confirms a grant,
// the service resolves the scope" split `attendance`/`leave` already use for
// their own view_team tiers. Admin passes via can()'s admin bypass and is
// never scoped down. Every WRITE route below stays `manage` — admin only.
const read = authorizeAny("teams", ["manage", "view_team"]);

const teamRouter = Router();

teamRouter.get("/", authenticate, read, list);
teamRouter.post("/", authenticate, manage, validateCreateTeamInput, create);
teamRouter.get("/:id", authenticate, read, getOne);
teamRouter.patch("/:id", authenticate, manage, validateUpdateTeamInput, update);
teamRouter.delete("/:id", authenticate, manage, remove);
teamRouter.get("/:id/members", authenticate, read, getMembers);
teamRouter.post("/:id/members", authenticate, manage, validateAddMemberInput, addMember);
teamRouter.delete("/:id/members/:userId", authenticate, manage, removeMember);

// §7.39 — the team's own head may toggle this, so it is NOT behind `manage`
// (admin-only). The head-or-admin check lives in the service, which has the
// team document needed to answer it.
teamRouter.patch("/:id/show-contacts", authenticate, read, toggleShowContacts);

export default teamRouter;

/**
 * Team types (§7.30, 2026-07-31) — a structural mirror of `lead.routes.js`'s
 * `leadSourceRouter`, but with real admin-managed writes (see
 * teamType.model.js's own comment for why this diverges from LeadSource,
 * which has none). Read access matches LeadSource's own reasoning — a
 * low-sensitivity shared config list, so any authenticated user can read it
 * (the Team form's Type dropdown needs it, and a non-admin can still view
 * Teams' `type` values elsewhere). Writes are gated by the same `teams.manage`
 * grant as the rest of this module, not a separate permission.
 */
const teamTypeRouter = Router();

teamTypeRouter.get("/", authenticate, listTypes);
teamTypeRouter.post("/", authenticate, manage, validateCreateTeamTypeInput, createType);
teamTypeRouter.patch("/:id", authenticate, manage, validateUpdateTeamTypeInput, updateType);

export { teamTypeRouter };
