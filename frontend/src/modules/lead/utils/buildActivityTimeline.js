import { CALL_OUTCOME_LABELS } from "../constants/lead.constants";

/**
 * There is no dedicated lead activity-log endpoint or model on the backend
 * (unlike `customer`, which has `customerActivity.model.js` — checked
 * `backend/src/modules/lead/` directly: only `lead`/`leadCall`/`leadSource`
 * exist). leads-customer-functional-spec.md still calls for an "Activity
 * Timeline" in the detail slide-over, so this assembles one client-side from
 * data the API already returns: the lead's own creation/lost/converted
 * facts, plus its call history — rather than inventing a backend feature
 * this task wasn't asked to build. Sorted newest-first, matching call
 * history's own ordering.
 */
export function buildActivityTimeline(lead, callHistory) {
  const entries = [];

  entries.push({
    key: "created",
    date: lead.createdAt,
    description: "Lead created",
  });

  callHistory.forEach((call) => {
    entries.push({
      key: `call-${call._id}`,
      date: call.calledAt,
      description: `Call logged — ${CALL_OUTCOME_LABELS[call.outcome] || call.outcome}`,
    });
  });

  if (lead.status === "lost" && lead.lostReason) {
    entries.push({
      key: "lost",
      date: lead.updatedAt,
      description: `Marked as Lost — ${lead.lostReason}`,
    });
  }

  if (lead.convertedCustomerId) {
    entries.push({
      key: "converted",
      date: lead.updatedAt,
      description: "Converted to Customer",
    });
  }

  return entries.sort((a, b) => new Date(b.date) - new Date(a.date));
}

export default buildActivityTimeline;
