import { describe, it, expect } from "vitest";
import dayjs from "dayjs";
import { computeAttendanceSummary } from "./attendanceSummary";

// June 2026: 30 days, starts on a Monday — 22 weekdays, 8 weekend days.
const JUNE_2026 = dayjs("2026-06-15");

function record(status) {
  return { status };
}

describe("computeAttendanceSummary", () => {
  it("counts each status independently", () => {
    const records = [record("present"), record("present"), record("absent"), record("half_day"), record("on_leave")];

    const summary = computeAttendanceSummary(records, JUNE_2026);

    expect(summary.present).toBe(2);
    expect(summary.absent).toBe(1);
    expect(summary.half_day).toBe(1);
    expect(summary.on_leave).toBe(1);
  });

  it("computes working days as weekdays only (June 2026 has 22)", () => {
    const summary = computeAttendanceSummary([], JUNE_2026);

    expect(summary.workingDays).toBe(22);
  });

  it("computes attendance rate as (present + half_day) / working days, rounded to 1 decimal", () => {
    // 10 present + 1 half_day = 10.5 "attended" out of 22 working days.
    const records = [...Array(10).fill(0).map(() => record("present")), record("half_day")];

    const summary = computeAttendanceSummary(records, JUNE_2026);

    expect(summary.attendanceRate).toBeCloseTo((10.5 / 22) * 100, 1);
  });

  it("returns a 0% rate (not NaN/Infinity) when there are no records at all", () => {
    const summary = computeAttendanceSummary([], JUNE_2026);

    expect(summary.attendanceRate).toBe(0);
  });

  it("ignores a record with an unrecognized status rather than throwing", () => {
    const summary = computeAttendanceSummary([{ status: "something_unexpected" }], JUNE_2026);

    expect(summary.present + summary.absent + summary.half_day + summary.on_leave).toBe(0);
  });
});
