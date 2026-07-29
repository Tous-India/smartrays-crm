import { Router } from "express";
import authenticate from "../../middlewares/authenticate.middleware.js";
import { authorize } from "../../middlewares/authorize.middleware.js";
import { list, getOne, updateTeam } from "./project.controller.js";
import { validateTeamUpdateInput } from "./project.validation.js";

const projectRouter = Router();

projectRouter.get("/", authenticate, authorize("projects", "view"), list);
projectRouter.get("/:id", authenticate, authorize("projects", "view"), getOne);
projectRouter.post(
  "/:id/team",
  authenticate,
  authorize("projects", "assign_team"),
  validateTeamUpdateInput,
  updateTeam
);

export default projectRouter;
