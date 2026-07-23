import { describe, it, expect } from "vitest";
import { classifyFollowUpUrgency, getUpcomingFollowUps, getHotLeads } from "./upcomingFollowUps";

function daysFromNow(days, hours = 12) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hours, 0, 0, 0);
  return date.toISOString();
}

describe("classifyFollowUpUrgency", () => {
  it("classifies a past date as overdue", () => {
    expect(classifyFollowUpUrgency(daysFromNow(-2))).toBe("overdue");
  });

  it("classifies today as today", () => {
    expect(classifyFollowUpUrgency(daysFromNow(0))).toBe("today");
  });

  it("classifies a date 1-3 days out as upcoming", () => {
    expect(classifyFollowUpUrgency(daysFromNow(1))).toBe("upcoming");
    expect(classifyFollowUpUrgency(daysFromNow(3))).toBe("upcoming");
  });
});

describe("getUpcomingFollowUps", () => {
  it("includes overdue, today, and within-3-days leads, excludes further out and none", () => {
    const leads = [
      { _id: "1", name: "Overdue", followUpDate: daysFromNow(-1) },
      { _id: "2", name: "Today", followUpDate: daysFromNow(0) },
      { _id: "3", name: "In 3 days", followUpDate: daysFromNow(3) },
      { _id: "4", name: "In 5 days", followUpDate: daysFromNow(5) },
      { _id: "5", name: "No follow-up", followUpDate: null },
    ];

    const result = getUpcomingFollowUps(leads);

    expect(result.map((lead) => lead.name)).toEqual(["Overdue", "Today", "In 3 days"]);
  });

  it("tags each result with its urgency and sorts soonest-first", () => {
    const leads = [
      { _id: "1", name: "In 3 days", followUpDate: daysFromNow(3) },
      { _id: "2", name: "Overdue", followUpDate: daysFromNow(-1) },
      { _id: "3", name: "Today", followUpDate: daysFromNow(0) },
    ];

    const result = getUpcomingFollowUps(leads);

    expect(result.map((lead) => lead.name)).toEqual(["Overdue", "Today", "In 3 days"]);
    expect(result.map((lead) => lead.followUpUrgency)).toEqual(["overdue", "today", "upcoming"]);
  });

  it("returns an empty array when no leads have a qualifying follow-up", () => {
    const leads = [{ _id: "1", name: "Far out", followUpDate: daysFromNow(10) }];

    expect(getUpcomingFollowUps(leads)).toEqual([]);
  });
});

describe("getHotLeads", () => {
  it("returns only leads with isHot true", () => {
    const leads = [
      { _id: "1", name: "Hot", isHot: true },
      { _id: "2", name: "Not hot", isHot: false },
    ];

    expect(getHotLeads(leads).map((lead) => lead.name)).toEqual(["Hot"]);
  });

  it("returns an empty array when no leads are hot", () => {
    expect(getHotLeads([{ _id: "1", isHot: false }])).toEqual([]);
  });
});
