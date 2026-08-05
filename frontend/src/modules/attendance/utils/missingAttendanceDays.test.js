import { describe, it, expect } from "vitest";
import dayjs from "dayjs";
import findMissingAttendanceDays from "./missingAttendanceDays";

const TODAY = dayjs("2026-06-10");

function run(overrides = {}) {
  return findMissingAttendanceDays({
    records: [],
    employeeId: "emp-1",
    from: dayjs("2026-06-01"),
    to: dayjs("2026-06-30"),
    today: TODAY,
    ...overrides,
  });
}

describe("findMissingAttendanceDays", () => {
  it("returns nothing when no employee is selected — gaps are a per-person question", () => {
    expect(run({ employeeId: "" })).toEqual([]);
  });

  it("excludes future days — an unstarted day is not a gap", () => {
    const missing = run();

    expect(missing.at(0).date.slice(0, 10)).toBe("2026-06-01");
    expect(missing.at(-1).date.slice(0, 10)).toBe("2026-06-10");
    expect(missing).toHaveLength(10);
  });

  it("includes today itself — a shift that never started is a real absence", () => {
    const missing = run();

    expect(missing.some((day) => day.date.slice(0, 10) === "2026-06-10")).toBe(true);
  });

  it("skips days that already have a record for that employee", () => {
    const missing = run({
      records: [
        { employeeId: "emp-1", date: "2026-06-03T00:00:00.000Z" },
        { employeeId: "emp-1", date: "2026-06-07T00:00:00.000Z" },
      ],
    });

    const dayKeys = missing.map((day) => day.date.slice(0, 10));
    expect(dayKeys).not.toContain("2026-06-03");
    expect(dayKeys).not.toContain("2026-06-07");
    expect(missing).toHaveLength(8);
  });

  it("ignores another employee's records when deciding this employee's gaps", () => {
    const missing = run({
      records: [{ employeeId: "emp-2", date: "2026-06-03T00:00:00.000Z" }],
    });

    expect(missing.map((day) => day.date.slice(0, 10))).toContain("2026-06-03");
  });

  it("flags every row it produces, with a key that cannot collide with a real record id", () => {
    const missing = run();

    expect(missing.every((day) => day.isMissingDay === true)).toBe(true);
    expect(missing.every((day) => day._id.startsWith("missing-emp-1-"))).toBe(true);
    expect(missing.every((day) => day.employeeId === "emp-1")).toBe(true);
  });

  it("returns nothing when the whole range is in the future", () => {
    expect(run({ from: dayjs("2026-07-01"), to: dayjs("2026-07-31") })).toEqual([]);
  });
});
