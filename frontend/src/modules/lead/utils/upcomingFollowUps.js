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
