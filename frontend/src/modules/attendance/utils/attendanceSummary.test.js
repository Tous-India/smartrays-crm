import { describe, it, expect } from "vitest";
import dayjs from "dayjs";
import { computeAttendanceSummary } from "./attendanceSummary";

// The attendance rate, redefined 2026-10-23 (owner's decision):
//   rate = attended days ÷ (people in view × working days that have happened)
// working days = Monday–Saturday (Sunday off); attended = present + ½ half day.
const JUNE_2026 = { from: dayjs("2026-06-01"), to: dayjs("2026-06-30") };
const AFTER_JUNE = dayjs("2026-07-15");

describe("computeAttendanceSummary", () => {
  it("counts each status independently", () => {
    const records = [{ status: "present" }, { status: "present" }, { status: "absent" }, { status: "half_day" }, { status: "on_leave" }];

    const summary = computeAttendanceSummary(records, { ...JUNE_2026, peopleCount: 1, now: AFTER_JUNE });

    expect(summary).toMatchObject({ present: 2, absent: 1, half_day: 1, on_leave: 1 });
  });

  it("counts Monday to Saturday as working days (June 2026 has 26)", () => {
    const summary = computeAttendanceSummary([], { ...JUNE_2026, peopleCount: 1, now: AFTER_JUNE });

    expect(summary.workingDays).toBe(26);
  });

  it("one person's month: (present + ½ half day) ÷ working days", () => {
    const records = [...Array(10).fill({ status: "present" }), { status: "half_day" }];

    const summary = computeAttendanceSummary(records, { ...JUNE_2026, peopleCount: 1, now: AFTER_JUNE });

    expect(summary.attendanceRate).toBeCloseTo((10.5 / 26) * 100, 1);
  });

  it("several people: divides by every person's working days — 3 of 8 present today is 37.5 %", () => {
    const today = dayjs("2026-10-22T18:00:00");
    const records = Array(3).fill({ status: "present" });

    const summary = computeAttendanceSummary(records, { from: today.startOf("day"), to: today.endOf("day"), peopleCount: 8, now: today });

    expect(summary.expectedDays).toBe(8);
    expect(summary.attendanceRate).toBe(37.5);
  });

  it("leaves out days that have not happened yet", () => {
    const summary = computeAttendanceSummary([], {
      from: dayjs("2026-10-01"),
      to: dayjs("2026-10-31"),
      peopleCount: 1,
      now: dayjs("2026-10-23T12:00:00"),
    });

    // 1–23 Oct 2026 minus three Sundays (4, 11, 18).
    expect(summary.workingDays).toBe(20);
  });

  it("never shows more than 100 % (e.g. someone also worked a Sunday)", () => {
    const summary = computeAttendanceSummary(Array(28).fill({ status: "present" }), { ...JUNE_2026, peopleCount: 1, now: AFTER_JUNE });

    expect(summary.attendanceRate).toBe(100);
  });

  it("has no rate (null, not 0 or NaN) when no working day has happened yet", () => {
    const summary = computeAttendanceSummary([], { ...JUNE_2026, peopleCount: 3, now: dayjs("2026-05-20") });

    expect(summary.attendanceRate).toBeNull();
  });

  it("ignores a record with an unrecognized status rather than throwing", () => {
    const summary = computeAttendanceSummary([{ status: "something_unexpected" }], { ...JUNE_2026, peopleCount: 1, now: AFTER_JUNE });

    expect(summary).toMatchObject({ present: 0, absent: 0, half_day: 0, on_leave: 0 });
  });
});
