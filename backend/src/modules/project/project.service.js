import ApiError from "../../utils/ApiError.js";
import Project from "./project.model.js";
import Task from "./task.model.js";

/**
 * Projects have no org-hierarchy "own team" concept the way Leads/Customers
 * do (via managerId) — a project's own team IS teamMemberIds/projectManagerId,
 * so that's the scoping boundary: admin sees everything, everyone else sees
 * only projects where they're the manager or a listed team member.
 */
function resolveProjectVisibilityFilter(requestingUser) {
  if (requestingUser.role === "admin") {
    return {};
  }

  return { $or: [{ projectManagerId: requestingUser._id }, { teamMemberIds: requestingUser._id }] };
}

export async function listProjects(requestingUser) {
  const filter = resolveProjectVisibilityFilter(requestingUser);

  return Project.find(filter).sort({ createdAt: -1 });
}

/**
 * 404 (not 403) for a project that exists but is outside scope, matching the
 * Leads/Customer/Location/User precedent — the route-level `projects.view`
 * gate is what turns away a caller with no grant at all; this only narrows
 * what a caller who DOES hold that grant can actually see.
 */
export async function getProjectById(projectId, requestingUser) {
  const filter = resolveProjectVisibilityFilter(requestingUser);
  const project = await Project.findOne({ _id: projectId, ...filter });

  if (!project) {
    throw new ApiError(404, "Project not found");
  }

  return project;
}

/**
 * Team members addable by Manager/Admin only (§7.3) — interpreted here as
 * "this specific project's manager, or an admin," not "anyone holding the
 * manager role globally." Holding `projects.assign_team` is the route-level
 * gate; this ownership check is the additional per-project restriction, the
 * same "self OR admin" shape as user.service.js#updateUser.
 */
export async function updateProjectTeam(projectId, { action, userId }, requestingUser) {
  const project = await Project.findById(projectId);

  if (!project) {
    throw new ApiError(404, "Project not found");
  }

  const isThisProjectsManager = String(project.projectManagerId) === String(requestingUser._id);
  const isAdmin = requestingUser.role === "admin";

  if (!isThisProjectsManager && !isAdmin) {
    throw new ApiError(403, "Only this project's manager or an admin can change its team");
  }

  if (action === "add") {
    const alreadyOnTeam = project.teamMemberIds.some((id) => String(id) === String(userId));

    if (!alreadyOnTeam) {
      project.teamMemberIds.push(userId);
    }
  } else {
    project.teamMemberIds = project.teamMemberIds.filter((id) => String(id) !== String(userId));
  }

  await project.save();

  return project;
}

export async function listProjectTasks(projectId, requestingUser) {
  await getProjectById(projectId, requestingUser);

  return Task.find({ projectId }).sort({ createdAt: -1 });
}

/**
 * assignedToId must be this project's manager or one of its team members —
 * a task can't be assigned to someone with no stake in the project.
 */
export async function createTask(payload, requestingUser) {
  const project = await getProjectById(payload.projectId, requestingUser);

  const isPartOfProject =
    String(project.projectManagerId) === String(payload.assignedToId) ||
    project.teamMemberIds.some((id) => String(id) === String(payload.assignedToId));

  if (!isPartOfProject) {
    throw new ApiError(400, "assignedToId must be this project's manager or a team member");
  }

  return Task.create({
    projectId: payload.projectId,
    title: payload.title,
    assignedToId: payload.assignedToId,
  });
}

async function findTaskOrThrow(taskId) {
  const task = await Task.findById(taskId);

  if (!task) {
    throw new ApiError(404, "Task not found");
  }

  return task;
}

/**
 * Starting/stopping your OWN task is an ownership check (assignedToId ===
 * requestingUser, or admin) resolved here — not a `tasks.*` permission tier,
 * the same reasoning as Leads' ownerId-based edit scoping and User's
 * self-vs-admin field rules. There is deliberately no `tasks.update_own`
 * registry entry for this reason.
 */
function ensureTaskOwnerOrAdmin(task, requestingUser) {
  const isAssignee = String(task.assignedToId) === String(requestingUser._id);
  const isAdmin = requestingUser.role === "admin";

  if (!isAssignee && !isAdmin) {
    throw new ApiError(403, "Only the assignee or an admin can update this task");
  }
}

/**
 * Server-side constraint: one `in_progress` task per employee at a time
 * (§6.4), enforced here — not just a disabled button — so it survives
 * multi-tab/multi-device races. Checked fresh against the database on every
 * start, not against client-supplied state.
 */
export async function startTask(taskId, requestingUser) {
  const task = await findTaskOrThrow(taskId);
  ensureTaskOwnerOrAdmin(task, requestingUser);

  if (task.status !== "todo") {
    throw new ApiError(409, "Only a todo task can be started");
  }

  const alreadyInProgress = await Task.findOne({
    assignedToId: task.assignedToId,
    status: "in_progress",
    _id: { $ne: task._id },
  });

  if (alreadyInProgress) {
    throw new ApiError(409, "You already have a task in progress — stop it before starting another.");
  }

  task.status = "in_progress";
  task.startedAt = new Date();
  await task.save();

  return task;
}

export async function stopTask(taskId, requestingUser) {
  const task = await findTaskOrThrow(taskId);
  ensureTaskOwnerOrAdmin(task, requestingUser);

  if (task.status !== "in_progress") {
    throw new ApiError(409, "Only an in-progress task can be stopped");
  }

  task.status = "done";
  task.stoppedAt = new Date();
  await task.save();

  return task;
}
