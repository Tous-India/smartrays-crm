import { Router } from "express";
import authenticate from "../../middlewares/authenticate.middleware.js";
import { authorize } from "../../middlewares/authorize.middleware.js";
import { list, getOne, updateTeam, getTasks, assignTask, start, stop } from "./project.controller.js";
import { validateTeamUpdateInput, validateCreateTaskInput } from "./project.validation.js";

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
projectRouter.get("/:id/tasks", authenticate, authorize("tasks", "view"), getTasks);

export default projectRouter;

// Tasks are a top-level resource per .context/final-plan.md §7.3
// (POST /tasks, not POST /projects/:id/tasks) — same sibling-router pattern
// lead.routes.js uses for leadRouter/leadSourceRouter.
const taskRouter = Router();

taskRouter.post("/", authenticate, authorize("tasks", "assign"), validateCreateTaskInput, assignTask);

// No route-level permission gate on start/stop — starting/stopping YOUR OWN
// task is an ownership check (or admin override) resolved in
// project.service.js, the same reasoning as PATCH /users/:id's self-editable
// fields; a `tasks.*` grant is about visibility/assignment, not this.
taskRouter.patch("/:id/start", authenticate, start);
taskRouter.patch("/:id/stop", authenticate, stop);

export { taskRouter };
