import { Router } from "express";
import authenticate from "../../middlewares/authenticate.middleware.js";
import { authorize } from "../../middlewares/authorize.middleware.js";
import { list, getOne, create, update, remove, getMembers, addMember, removeMember } from "./team.controller.js";
import { validateCreateTeamInput, validateUpdateTeamInput, validateAddMemberInput } from "./team.validation.js";

// Gated by teams.manage (can()-backed) rather than requireAdmin — same
// reasoning as the Permissions module's own `manage` tier
// (permission.routes.js): only an admin holds this grant today, but using
// the same can()-backed mechanism as every other module keeps Team
// consistent rather than a one-off hardcoded role check.
const manage = authorize("teams", "manage");

const teamRouter = Router();

teamRouter.get("/", authenticate, manage, list);
teamRouter.post("/", authenticate, manage, validateCreateTeamInput, create);
teamRouter.get("/:id", authenticate, manage, getOne);
teamRouter.patch("/:id", authenticate, manage, validateUpdateTeamInput, update);
teamRouter.delete("/:id", authenticate, manage, remove);
teamRouter.get("/:id/members", authenticate, manage, getMembers);
teamRouter.post("/:id/members", authenticate, manage, validateAddMemberInput, addMember);
teamRouter.delete("/:id/members/:userId", authenticate, manage, removeMember);

export default teamRouter;
