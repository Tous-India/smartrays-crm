/**
 * Pure frontend derivation from the already-fetched leads list — no new
 * backend endpoint, per this task's own scope. "Within the next 3 days"
 * intentionally also surfaces overdue/today follow-ups (not just days 1-3
 * ahead): the point of this section is "don't let a follow-up slip through
 * the cracks," and an overdue one is the most urgent case of that, not an
 * unrelated one. `urgency` drives the visual distinction the task asks for.
 */
export function classifyFollowUpUrgency(followUpDate) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

  const date = new Date(followUpDate);

  if (date < startOfToday) {
    return "overdue";
  }

  if (date < startOfTomorrow) {
    return "today";
  }

  return "upcoming";
}

export function getUpcomingFollowUps(leads) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const cutoff = new Date(startOfToday);
  cutoff.setDate(cutoff.getDate() + 4); // through the end of day+3

  return leads
    .filter((lead) => lead.followUpDate && new Date(lead.followUpDate) < cutoff)
    .map((lead) => ({ ...lead, followUpUrgency: classifyFollowUpUrgency(lead.followUpDate) }))
    .sort((a, b) => new Date(a.followUpDate) - new Date(b.followUpDate));
}

export function getHotLeads(leads) {
  return leads.filter((lead) => lead.isHot);
}

// Overdue is the most urgent thing a "needs attention" row can flag — a
// follow-up already missed beats one due today, which beats one due within
// 3 days, which beats "just hot" with no near-term follow-up at all.
const PRIORITY_ORDER = { overdue: 0, today: 1, upcoming: 2, hot: 3 };

/**
 * Merges Hot Leads + Upcoming Follow-ups into one deduped, priority-sorted
 * list — a lead that's both hot AND has a near-term follow-up appears once,
 * carrying both `isHot` and `followUpUrgency` so the card can show both
 * signals rather than picking one arbitrarily.
 */
export function getPriorityLeads(leads) {
  const hotLeads = getHotLeads(leads);
  const upcoming = getUpcomingFollowUps(leads);

  const byId = new Map();
  hotLeads.forEach((lead) => byId.set(lead._id, { ...lead, followUpUrgency: null }));
  upcoming.forEach((lead) => {
    const existing = byId.get(lead._id);
    byId.set(lead._id, existing ? { ...existing, followUpUrgency: lead.followUpUrgency } : lead);
  });

  return Array.from(byId.values()).sort((a, b) => {
    const priorityA = PRIORITY_ORDER[a.followUpUrgency || "hot"];
    const priorityB = PRIORITY_ORDER[b.followUpUrgency || "hot"];
    return priorityA - priorityB;
  });
}
