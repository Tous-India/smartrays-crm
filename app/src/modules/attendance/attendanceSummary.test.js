import { buildMonthDays, computeAttendanceSummary } from "./attendanceSummary";

/**
 * The month summary is the web's own rule (frontend/src/modules/attendance/
 * utils/attendanceSummary.js), not a new one: attended = present + ½ half
 * day, over the Monday–Saturday working days that have happened.
 */
const at = (day, status, workingHours) => ({ _id: `r-${day}-${status}`, date: `2026-10-${String(day).padStart(2, "0")}T00:00:00.000Z`, status, workingHours });

describe("computeAttendanceSummary (same rule as the web)", () => {
  test("counts by status, attended = present + ½ half day, rate over working days so far (Sundays off)", () => {
    // 1–10 Oct 2026: Thu 1 … Sat 10, Sunday the 4th is off → 9 working days.
    const records = [at(1, "present", 8), at(2, "present", 8.5), at(3, "half_day", 4), at(5, "absent"), at(6, "on_leave"), at(7, "present", 7.25)];
    const summary = computeAttendanceSummary(records, { from: new Date(2026, 9, 1), to: new Date(2026, 9, 31), now: new Date(2026, 9, 10, 12) });

    expect(summary).toMatchObject({ present: 3, half_day: 1, absent: 1, on_leave: 1, workingDays: 9, attendedDays: 3.5, attendanceRate: 38.9 });
    expect(summary.hours).toBe(27.75);
  });

  test("no working day yet → no rate; never above 100", () => {
    expect(computeAttendanceSummary([], { from: new Date(2026, 10, 1), to: new Date(2026, 10, 30), now: new Date(2026, 9, 20) }).attendanceRate).toBeNull();
    const many = [1, 2, 3].map((day) => at(day, "present"));
    expect(computeAttendanceSummary(many, { from: new Date(2026, 9, 1), to: new Date(2026, 9, 31), now: new Date(2026, 9, 1, 12) }).attendanceRate).toBe(100);
  });
});

describe("buildMonthDays — the calendar grid", () => {
  test("weeks start on Monday; each day carries its status; Sundays are off, future days empty", () => {
    const records = [at(1, "present"), at(5, "absent"), at(5, "present"), at(6, "half_day")];
    const weeks = buildMonthDays(new Date(2026, 9, 1), records, { now: new Date(2026, 9, 7, 12) });
    const days = weeks.flat().filter(Boolean);

    // October 2026 starts on a Thursday: three blanks before the 1st.
    expect(weeks[0].slice(0, 3)).toEqual([null, null, null]);
    expect(days).toHaveLength(31);
    expect(days[0]).toMatchObject({ day: 1, kind: "present" });
    expect(days[3]).toMatchObject({ day: 4, kind: "off" });
    // Two records on one day: the better outcome shows (present over absent).
    expect(days[4]).toMatchObject({ day: 5, kind: "present" });
    expect(days[5]).toMatchObject({ day: 6, kind: "half_day" });
    // A past working day with nothing recorded, today, and a future day.
    expect(days[1]).toMatchObject({ day: 2, kind: "none" });
    expect(days[6]).toMatchObject({ day: 7, kind: "none", isToday: true });
    expect(days[7]).toMatchObject({ day: 8, kind: "future" });
  });

  test("an open shift today shows as on shift", () => {
    const open = { _id: "o", date: "2026-10-07T00:00:00.000Z", checkIn: { time: "2026-10-07T04:00:00.000Z" }, checkOut: {} };
    const days = buildMonthDays(new Date(2026, 9, 1), [open], { now: new Date(2026, 9, 7, 12) }).flat().filter(Boolean);

    expect(days[6]).toMatchObject({ day: 7, kind: "on_shift" });
  });
});
