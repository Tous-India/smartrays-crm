import mongoose from "mongoose";
import ApiError from "../../utils/ApiError.js";
import { SERVICE_STATUSES } from "./service.model.js";

function assertObjectId(value, label) {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw new ApiError(400, `${label} must be a valid id`);
  }
}

function assertOptionalDate(value, label) {
  if (value !== undefined && value !== null && value !== "" && Number.isNaN(Date.parse(value))) {
    throw new ApiError(400, `${label} must be a valid date`);
  }
}

function assertOptionalSubtasks(subtasks) {
  if (subtasks === undefined) {
    return;
  }

  if (!Array.isArray(subtasks)) {
    throw new ApiError(400, "subtasks must be an array");
  }

  subtasks.forEach((subtask) => {
    if (!subtask || typeof subtask.title !== "string" || !subtask.title.trim()) {
      throw new ApiError(400, "Every subtask needs a title");
    }
  });
}

function assertOptionalStatus(status) {
  if (status !== undefined && !SERVICE_STATUSES.includes(status)) {
    throw new ApiError(400, `status must be one of: ${SERVICE_STATUSES.join(", ")}`);
  }
}

export function validateCreateServiceInput(req, res, next) {
  const { title, assignedToId, dueDate, subtasks, status } = req.body;

  if (!title || !title.trim()) {
    throw new ApiError(400, "Title is required");
  }

  if (!assignedToId) {
    throw new ApiError(400, "assignedToId is required");
  }

  assertObjectId(assignedToId, "assignedToId");
  assertOptionalDate(dueDate, "dueDate");
  assertOptionalSubtasks(subtasks);
  assertOptionalStatus(status);

  next();
}

export function validateUpdateServiceInput(req, res, next) {
  const { title, assignedToId, dueDate, subtasks, status } = req.body;

  if (title !== undefined && (!title || !title.trim())) {
    throw new ApiError(400, "Title cannot be empty");
  }

  if (assignedToId !== undefined) {
    assertObjectId(assignedToId, "assignedToId");
  }

  // Status has its own endpoint so completedAt/completedById are set in one
  // place; sending it here is a client mistake, not something to silently drop.
  if (status !== undefined) {
    throw new ApiError(400, "Change status via PATCH /services/:id/status");
  }

  assertOptionalDate(dueDate, "dueDate");
  assertOptionalSubtasks(subtasks);

  next();
}

export function validateStatusInput(req, res, next) {
  const { status } = req.body;

  if (!SERVICE_STATUSES.includes(status)) {
    throw new ApiError(400, `status must be one of: ${SERVICE_STATUSES.join(", ")}`);
  }

  next();
}

export function validateListQuery(req, res, next) {
  const { status, assignedTo } = req.query;

  assertOptionalStatus(status);

  if (assignedTo !== undefined) {
    assertObjectId(assignedTo, "assignedTo");
  }

  next();
}

export function validateSubtaskInput(req, res, next) {
  assertObjectId(req.params.subtaskId, "subtaskId");

  if (typeof req.body.isDone !== "boolean") {
    throw new ApiError(400, "isDone must be true or false");
  }

  next();
}
