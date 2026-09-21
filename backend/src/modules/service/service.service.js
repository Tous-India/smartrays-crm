import ApiError from "../../utils/ApiError.js";
import { can } from "../../helpers/permission.helper.js";
import { resolveDirectReportIds } from "../attendance/attendance.service.js";
import { createNotification } from "../notification/notification.service.js";
import Service, { SERVICE_STATUSES } from "./service.model.js";
import User from "../user/user.model.js";

/**
 * WHO CAN SEE WHICH SERVICES (§7.72). Resolved here, once, and applied to
 * EVERY query in this file — MongoDB has no row-level security, so the
 * scope has to be in the filter of every find, or it is not enforced.
 *
 * Returns the set of assignee ids the caller may see, or `null` for "no
 * restriction" (admin). The three tiers are the same shape Leads and
 * Customers use (`resolveOwnershipFilter`), keyed on `assignedToId` instead
 * of `ownerId`:
 *   admin    → everyone
 *   manager  → their direct reports AND themselves — an admin can assign a
 *              service to a manager, and a manager must be able to see it
 *   anyone else → only themselves
 *
 * The manager's team comes from the EXISTING `resolveDirectReportIds`
 * (attendance.service.js — `User.find({ managerId })`), not a ninth copy of
 * that query.
 */
async function resolveVisibleAssigneeIds(requestingUser) {
  if (requestingUser.role === "admin") {
    return null;
  }

  if (requestingUser.role === "manager") {
    const teamIds = await resolveDirectReportIds(requestingUser);
    return [...teamIds, requestingUser._id];
  }

  return [requestingUser._id];
}

function scopeFilter(visibleAssigneeIds) {
  return visibleAssigneeIds === null ? {} : { assignedToId: { $in: visibleAssigneeIds } };
}

/**
 * Who the caller may ASSIGN to. The same set as the visible scope — a
 * manager hands work to their own team (or themselves), an admin to anyone —
 * with one extra rule for everyone: the assignee must be a live account.
 * Returns the active users in that set, for the picker (`listAssignees`).
 */
async function resolveAssignableUsers(requestingUser) {
  const visibleAssigneeIds = await resolveVisibleAssigneeIds(requestingUser);
  const filter = { isActive: true, ...(visibleAssigneeIds === null ? {} : { _id: { $in: visibleAssigneeIds } }) };

  return User.find(filter).select("_id name role").sort({ name: 1 });
}

async function ensureAssignable(assignedToId, requestingUser) {
  const assignable = await resolveAssignableUsers(requestingUser);
  const allowed = assignable.some((user) => String(user._id) === String(assignedToId));

  if (!allowed) {
    // 400, not 404: the id may be a perfectly real user — they are simply not
    // someone this caller may assign work to.
    throw new ApiError(400, "assignedToId must be an active user you can assign to");
  }
}

/**
 * Fetches a service only if it is within the caller's scope. 404 (not 403)
 * for anything outside it, so an out-of-scope caller cannot distinguish
 * "does not exist" from "exists but is not yours" — the convention every
 * scoped module in this codebase follows.
 */
async function getServiceInScope(serviceId, requestingUser) {
  const visibleAssigneeIds = await resolveVisibleAssigneeIds(requestingUser);
  const service = await Service.findOne({ _id: serviceId, ...scopeFilter(visibleAssigneeIds) });

  if (!service) {
    throw new ApiError(404, "Service not found");
  }

  return service;
}

/**
 * `GET /services?status=&assignedTo=`. The optional `assignedTo` filter can
 * only ever NARROW the scope — asking for someone outside it returns nothing,
 * never widens it.
 */
export async function listServices({ status, assignedTo } = {}, requestingUser) {
  const visibleAssigneeIds = await resolveVisibleAssigneeIds(requestingUser);
  const filter = scopeFilter(visibleAssigneeIds);

  if (status) {
    filter.status = status;
  }

  if (assignedTo) {
    const inScope = visibleAssigneeIds === null || visibleAssigneeIds.some((id) => String(id) === String(assignedTo));
    filter.assignedToId = inScope ? assignedTo : { $in: [] };
  }

  return Service.find(filter).sort({ status: 1, dueDate: 1, createdAt: -1 });
}

export async function listAssignees(requestingUser) {
  return resolveAssignableUsers(requestingUser);
}

export async function getService(serviceId, requestingUser) {
  return getServiceInScope(serviceId, requestingUser);
}

export async function createService(payload, requestingUser) {
  await ensureAssignable(payload.assignedToId, requestingUser);

  const service = await Service.create({
    title: payload.title,
    description: payload.description || "",
    status: payload.status || "todo",
    assignedToId: payload.assignedToId,
    createdById: requestingUser._id,
    dueDate: payload.dueDate ? new Date(payload.dueDate) : null,
    subtasks: normaliseSubtasks(payload.subtasks),
    ...(payload.status === "completed" ? { completedAt: new Date(), completedById: requestingUser._id } : {}),
  });

  await notifyAssigned(service, requestingUser);

  return service;
}

const EDITABLE_FIELDS = ["title", "description", "dueDate", "subtasks", "assignedToId"];

/**
 * `PATCH /services/:id` — every field except status, which has its own
 * endpoint so `completedAt`/`completedById` are set in exactly one place.
 * Reassignment goes through the same assignable check as creation and
 * notifies the NEW assignee.
 */
export async function updateService(serviceId, payload, requestingUser) {
  const service = await getServiceInScope(serviceId, requestingUser);
  const previousAssignee = String(service.assignedToId);

  if (payload.assignedToId !== undefined && String(payload.assignedToId) !== previousAssignee) {
    await ensureAssignable(payload.assignedToId, requestingUser);
  }

  EDITABLE_FIELDS.forEach((field) => {
    if (payload[field] === undefined) {
      return;
    }

    if (field === "dueDate") {
      service.dueDate = payload.dueDate ? new Date(payload.dueDate) : null;
    } else if (field === "subtasks") {
      service.subtasks = normaliseSubtasks(payload.subtasks);
    } else {
      service[field] = payload[field];
    }
  });

  await service.save();

  if (String(service.assignedToId) !== previousAssignee) {
    await notifyAssigned(service, requestingUser);
  }

  return service;
}

/**
 * `PATCH /services/:id/status`. Who may flip it: anyone in scope holding
 * `services.edit`, OR the assignee themselves — an employee has only
 * `services.view` and must still be able to mark their own work done. That
 * is an ownership rule resolved here, the same reasoning the removed Task
 * feature used for start/stop, not a separate grant.
 */
export async function changeServiceStatus(serviceId, status, requestingUser) {
  const service = await getServiceInScope(serviceId, requestingUser);
  ensureAssigneeOrEditor(service, requestingUser, "change its status");

  if (service.status === status) {
    return service;
  }

  service.status = status;

  if (status === "completed") {
    service.completedAt = new Date();
    service.completedById = requestingUser._id;
  } else {
    service.completedAt = null;
    service.completedById = null;
  }

  await service.save();

  return service;
}

/**
 * The one rule both progress endpoints share: the assignee may move their
 * own work along without an edit grant; anyone else in scope needs
 * `services.edit`. Resolved AFTER the scope check, so an out-of-scope caller
 * has already received a 404 and never learns a 403.
 */
function ensureAssigneeOrEditor(service, requestingUser, verb) {
  const isAssignee = String(service.assignedToId) === String(requestingUser._id);

  if (!isAssignee && !can(requestingUser, "services", "edit")) {
    throw new ApiError(403, `Only the assignee or someone who can edit services can ${verb}`);
  }
}

/**
 * `PATCH /services/:id/subtasks/:subtaskId` — tick one subtask done or
 * undone. Same gating as status: scope first (404), then assignee-or-edit.
 *
 * Deliberately does NOT complete the service when the last subtask is
 * ticked. Subtasks are the assignee's working notes; completing is the
 * deliberate, separate act of saying the work is done, and it is what
 * stamps `completedAt`/`completedById`. Conflating the two would let a
 * checklist finish a job nobody has signed off.
 */
export async function changeSubtaskDone(serviceId, subtaskId, isDone, requestingUser) {
  const service = await getServiceInScope(serviceId, requestingUser);
  ensureAssigneeOrEditor(service, requestingUser, "update its subtasks");

  const subtask = service.subtasks.id(subtaskId);

  if (!subtask) {
    throw new ApiError(404, "Subtask not found");
  }

  subtask.isDone = isDone;
  await service.save();

  return service;
}

export async function deleteService(serviceId, requestingUser) {
  const service = await getServiceInScope(serviceId, requestingUser);

  await service.deleteOne();
}

function normaliseSubtasks(subtasks) {
  if (!Array.isArray(subtasks)) {
    return [];
  }

  return subtasks
    .filter((subtask) => subtask && typeof subtask.title === "string" && subtask.title.trim())
    .map((subtask) => ({ title: subtask.title.trim(), isDone: Boolean(subtask.isDone) }));
}

/**
 * The assignee is told through the EXISTING fan-out (`createNotification`
 * → in-app row + every push transport), not a new path. Never notifies
 * someone for assigning work to themselves.
 */
async function notifyAssigned(service, requestingUser) {
  if (String(service.assignedToId) === String(requestingUser._id)) {
    return;
  }

  await createNotification(
    service.assignedToId,
    "service_assigned",
    `${requestingUser.name} assigned you: ${service.title}`,
    { module: "services", id: service._id }
  );
}

export { SERVICE_STATUSES };
