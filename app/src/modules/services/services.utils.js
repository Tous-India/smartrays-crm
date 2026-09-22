import { daysFromToday } from "../../utils/date.utils";

/** The two statuses the server knows (§7.72). */
export const SERVICE_STATUS = {
  TODO: "todo",
  COMPLETED: "completed",
};

/** A to-do service whose due date has passed. Completed ones are never overdue. */
export function isOverdue(service, now = new Date()) {
  return service.status === SERVICE_STATUS.TODO && Boolean(service.dueDate) && daysFromToday(service.dueDate, now) < 0;
}

/** A to-do service due today. */
export function isDueToday(service, now = new Date()) {
  return service.status === SERVICE_STATUS.TODO && Boolean(service.dueDate) && daysFromToday(service.dueDate, now) === 0;
}

/**
 * The same order the web's dashboard widget uses: overdue first, then due
 * soonest, then the undated ones in the order the server gave them.
 */
export function sortByUrgency(services, now = new Date()) {
  const dated = services.filter((service) => service.dueDate);
  const undated = services.filter((service) => !service.dueDate);

  dated.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

  return [...dated, ...undated];
}

/** "3 of 5 done" for the subtask line, or null when there are none. */
export function subtaskProgress(service) {
  const total = service.subtasks?.length || 0;

  if (total === 0) {
    return null;
  }

  const done = service.subtasks.filter((subtask) => subtask.isDone).length;

  return { done, total };
}
