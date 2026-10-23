import { formatDate, formatTime } from "../../../utils/date.utils";
// Verified site visits (2026-10-22): the five words the office sees, and one
// plain sentence explaining each — computed by the server from where the
// phone actually was (visit.status.js).

export const VISIT_STATUS = {
  verified: { label: "Verified", color: "green" },
  left_early: { label: "Left early", color: "red" },
  not_at_site: { label: "Not at site", color: "red" },
  at_site: { label: "At site now", color: "blue" },
  not_started: { label: "Not started", color: "default" },
};

export const VISIT_PURPOSES = ["Site survey", "Installation", "Service visit", "Inspection", "Net-meter work"];

const time = (iso) => formatTime(iso);
const day = (iso) => formatDate(iso);

export function explainVisit(visit) {
  const arrived = visit.arrival?.at ? time(visit.arrival.at) : null;
  const done = visit.completion?.at ? time(visit.completion.at) : null;

  switch (visit.status) {
    case "verified":
      return `Arrived ${arrived} and marked done ${done} at the site (${visit.minutesOnSite} min). The route stayed at the site.`;
    case "left_early":
      if (visit.leftAt && done) return `Arrived ${arrived}, but the phone left the site at ${time(visit.leftAt)} before Done.`;
      if (visit.leftAt) return `Arrived ${arrived}; the phone left the site at ${time(visit.leftAt)} and the visit was never marked done.`;
      return `Arrived ${arrived}; the visit was never marked done.`;
    case "not_at_site":
      return `No Arrived on ${day(visit.dueDate)}. Arrived can only be tapped at the site, so nobody was there.`;
    case "at_site":
      return `Arrived ${arrived}. At the site now.`;
    default:
      return "Not started yet.";
  }
}
