import dayjs from "dayjs";

/**
 * Urgency ordering for open services (§7.72 dashboard widgets): overdue
 * first (most overdue at the top), then due soonest, then undated. One
 * function so the two widgets and anything else that ranks open work agree.
 */
export function isOverdue(service, now = dayjs()) {
  return service.status !== "completed" && Boolean(service.dueDate) && dayjs(service.dueDate).isBefore(now, "day");
}

export function sortByUrgency(services, now = dayjs()) {
  return [...services].sort((a, b) => {
    const aOverdue = isOverdue(a, now);
    const bOverdue = isOverdue(b, now);

    if (aOverdue !== bOverdue) {
      return aOverdue ? -1 : 1;
    }

    if (a.dueDate && b.dueDate) {
      return new Date(a.dueDate) - new Date(b.dueDate);
    }

    if (a.dueDate || b.dueDate) {
      return a.dueDate ? -1 : 1;
    }

    return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
  });
}

export function subtaskProgress(service) {
  const total = service.subtasks?.length || 0;

  if (total === 0) {
    return null;
  }

  return { done: service.subtasks.filter((subtask) => subtask.isDone).length, total };
}
