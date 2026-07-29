import ApiError from "../../utils/ApiError.js";
import Project from "./project.model.js";

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
