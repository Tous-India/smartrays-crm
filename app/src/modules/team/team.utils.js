import { startOfDay } from "../../utils/date.utils";

/**
 * Pure helpers over what the team endpoints return. They combine the
 * server's answers into "where each person stands today"; they decide no
 * rule of their own — open shift, silence and leave are all read as given.
 */

/** The states a direct report can be in today, in the order the roster lists them. */
export const TEAM_STATUS = {
  SILENT: "silent",
  CHECKED_IN: "checked_in",
  CHECKED_OUT: "checked_out",
  ON_LEAVE: "on_leave",
  NOT_CHECKED_IN: "not_checked_in",
};

const STATUS_ORDER = [TEAM_STATUS.SILENT, TEAM_STATUS.CHECKED_IN, TEAM_STATUS.CHECKED_OUT, TEAM_STATUS.ON_LEAVE, TEAM_STATUS.NOT_CHECKED_IN];

export const TEAM_STATUS_LABELS = {
  [TEAM_STATUS.SILENT]: "Silent",
  [TEAM_STATUS.CHECKED_IN]: "Checked in",
  [TEAM_STATUS.CHECKED_OUT]: "Checked out",
  [TEAM_STATUS.ON_LEAVE]: "On leave",
  [TEAM_STATUS.NOT_CHECKED_IN]: "Not checked in",
};

/** The latest of a person's records whose `date` is today (local). */
export function todaysRecordFor(records, employeeId, now = new Date()) {
  const today = startOfDay(now).getTime();
  const mine = records.filter(
    (record) => String(record.employeeId) === String(employeeId) && record.date && startOfDay(record.date).getTime() === today
  );

  if (mine.length === 0) {
    return null;
  }

  return mine.reduce((latest, record) =>
    new Date(record.checkIn?.time || record.date) > new Date(latest.checkIn?.time || latest.date) ? record : latest
  );
}

/** An approved leave that covers today. */
export function leaveCoveringToday(leaves, employeeId, now = new Date()) {
  const today = startOfDay(now).getTime();

  return (
    leaves.find(
      (leave) =>
        String(leave.employeeId) === String(employeeId) &&
        leave.status === "approved" &&
        startOfDay(leave.startDate).getTime() <= today &&
        startOfDay(leave.endDate).getTime() >= today
    ) || null
  );
}

/** A position older than the server's threshold is stale — silence, in the live sense. */
export function isStale(capturedAt, staleAfterMinutes, now = new Date()) {
  return now.getTime() - new Date(capturedAt).getTime() > staleAfterMinutes * 60 * 1000;
}

/**
 * One roster row per direct report. `live` is `GET /location/live`'s answer;
 * "silent" means an open shift with no position at all (`unlocatable`) or a
 * position older than `staleAfterMinutes` — the web Live Map's distinction.
 */
export function buildRoster({ reports, records, leaves, live, staleAfterMinutes, now = new Date() }) {
  const entryByEmployee = new Map((live?.entries || []).map((entry) => [String(entry.employeeId), entry]));
  const unlocatable = new Set((live?.unlocatable || []).map((person) => String(person.employeeId)));

  const rows = reports.map((person) => {
    const record = todaysRecordFor(records, person._id, now);
    const entry = entryByEmployee.get(String(person._id)) || null;
    const leave = leaveCoveringToday(leaves, person._id, now);
    const isOpen = Boolean(record?.checkIn?.time && !record?.checkOut?.time);

    let status = TEAM_STATUS.NOT_CHECKED_IN;

    if (isOpen) {
      const silent = unlocatable.has(String(person._id)) || !entry || isStale(entry.capturedAt, staleAfterMinutes, now);
      status = silent ? TEAM_STATUS.SILENT : TEAM_STATUS.CHECKED_IN;
    } else if (record?.checkOut?.time) {
      status = TEAM_STATUS.CHECKED_OUT;
    } else if (leave) {
      status = TEAM_STATUS.ON_LEAVE;
    }

    return { person, record, entry, leave, status, lastSeenAt: entry?.capturedAt || null };
  });

  return rows.sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || a.person.name.localeCompare(b.person.name));
}

/** "3h 07m" / "12m" since an instant. */
export function formatAgo(iso, now = new Date()) {
  const minutes = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60000));

  if (minutes < 60) {
    return `${minutes}m`;
  }

  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

/** Open services grouped by assignee id, each group overdue-first, groups by name. */
export function groupServicesByAssignee(services, nameById) {
  const groups = new Map();

  services.forEach((service) => {
    const key = String(service.assignedToId);

    if (!groups.has(key)) {
      groups.set(key, { assigneeId: key, name: nameById.get(key) || "Unknown", services: [] });
    }

    groups.get(key).services.push(service);
  });

  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
}
