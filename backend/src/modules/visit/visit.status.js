import { evaluateFixAgainstFence } from "../../services/geo.service.js";

/**
 * What the office sees for a visit (2026-10-22). Pure: the visit, its day,
 * the employee's location pings and "now" in; one word out.
 *
 *   not_started  no Arrived yet, and the day is not over
 *   not_at_site  the day passed with no Arrived — the app only allows
 *                Arrived inside the site's geofence, so nobody was there
 *   at_site      Arrived, not Done yet, today, and the phone has not left
 *   left_early   Arrived, then the route shows the phone leaving the site
 *                before Done — or the day ended without Done
 *   verified     Arrived and Done at the site, and the route in between
 *                stayed there
 *
 * "Leaving" = two or more consecutive pings outside the fence (the shared
 * accuracy-aware rule, geo.service.js#evaluateFixAgainstFence), so one bad
 * GPS fix never brands a visit. Pings too vague to judge are skipped.
 */
export const VISIT_STATUSES = ["not_started", "not_at_site", "at_site", "left_early", "verified"];
const CONSECUTIVE_OUTSIDE_TO_LEAVE = 2;
const DAY_MS = 24 * 3600000;

export function dayBounds(dueDate) {
  const due = new Date(dueDate);
  const start = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  return { start, end: new Date(start.getTime() + DAY_MS) };
}

/** The first moment the phone was judged to have left, or null. */
export function findLeftAt(visit, pings, maxAccuracyMeters) {
  let run = 0;
  let runStart = null;

  for (const ping of pings) {
    const fence = evaluateFixAgainstFence(visit.site, ping.coords, visit.radiusMeters, maxAccuracyMeters);
    if (!fence.evaluated) continue;

    if (fence.outside) {
      run += 1;
      runStart = runStart || ping.capturedAt;
      if (run >= CONSECUTIVE_OUTSIDE_TO_LEAVE) return runStart;
    } else {
      run = 0;
      runStart = null;
    }
  }

  return null;
}

/** The window whose pings matter: Arrived → Done (or end of day / now). */
export function evidenceWindow(visit, dueDate, now) {
  if (!visit.arrival?.at) return null;
  const { end } = dayBounds(dueDate);
  const until = visit.completion?.at || (now >= end ? end : now);
  return { from: visit.arrival.at, to: until };
}

export function computeVisitStatus({ visit, dueDate, pings = [], now = new Date(), maxAccuracyMeters }) {
  const dayOver = dueDate ? now >= dayBounds(dueDate).end : false;

  if (!visit.arrival?.at) {
    return { status: dayOver ? "not_at_site" : "not_started", leftAt: null };
  }

  const window = evidenceWindow(visit, dueDate, now);
  const inWindow = pings
    .filter((ping) => ping.capturedAt > window.from && ping.capturedAt <= window.to)
    .sort((a, b) => a.capturedAt - b.capturedAt);
  const leftAt = findLeftAt(visit, inWindow, maxAccuracyMeters);

  if (visit.completion?.at) {
    return { status: leftAt ? "left_early" : "verified", leftAt };
  }

  return { status: leftAt || dayOver ? "left_early" : "at_site", leftAt };
}
