import { Router } from "express";
import authenticate from "../../middlewares/authenticate.middleware.js";
import { authorize } from "../../middlewares/authorize.middleware.js";
import { list, assignees, getOne, create, update, changeStatus, toggleSubtask, remove } from "./service.controller.js";
import {
  validateCreateServiceInput,
  validateUpdateServiceInput,
  validateStatusInput,
  validateSubtaskInput,
  validateListQuery,
} from "./service.validation.js";

/**
 * Services (§7.72). `authorize()` answers "may this role touch services at
 * all"; WHICH services is decided inside service.service.js by the caller's
 * scope, on every query. Status changes are deliberately behind `view`, not
 * `edit`: an employee holds only `view` and must be able to complete their
 * own work — the service layer then checks they are the assignee.
 */
const serviceRouter = Router();

serviceRouter.get("/", authenticate, authorize("services", "view"), validateListQuery, list);
// Who the caller may assign to — the scoped picker's source. `create` is the
// gate because that is the action it exists to serve.
serviceRouter.get("/assignees", authenticate, authorize("services", "create"), assignees);
serviceRouter.post("/", authenticate, authorize("services", "create"), validateCreateServiceInput, create);
serviceRouter.get("/:id", authenticate, authorize("services", "view"), getOne);
serviceRouter.patch("/:id", authenticate, authorize("services", "edit"), validateUpdateServiceInput, update);
serviceRouter.patch("/:id/status", authenticate, authorize("services", "view"), validateStatusInput, changeStatus);
// Subtasks follow the status endpoint's gating exactly: `view` at the route,
// assignee-or-edit inside, service scope first.
serviceRouter.patch("/:id/subtasks/:subtaskId", authenticate, authorize("services", "view"), validateSubtaskInput, toggleSubtask);
serviceRouter.delete("/:id", authenticate, authorize("services", "delete"), remove);

export default serviceRouter;
