import { describe, it, expect, beforeEach } from "vitest";
import {
  ANNUAL_PAID_LEAVE_DAYS,
  computeEmployeeMonth,
  daysInMonth,
  leaveYearStart,
  perDayRate,
} from "./salaryCalculation.service.js";

/**
 * The shared salary calculator (§7.47, 2026-08-11).
 *
 * NEW MODULE, no prior version — there was no calculator to fail against, and
 * saying these "fail first" would overstate them. What they pin is the set of
 * rules that produce a payslip figure, which is the reason the calculation
 * lives in one place at all: the Payroll module must consume this rather than
 * grow a second copy that disagrees.
 */

const user = (overrides = {}) => ({ _id: "u1", name: "Test", baseSalary: 30000, ...overrides });

/**
 * Absence is counted per DATE from LEAVE records (§7.50), so fixtures carry
 * real dates. `day` is a day-of-month in August 2026; each gets its own by
 * default so a fixture never accidentally collides with another.
 */
let nextDay = 1;
const record = (status, day = nextDay++) => ({ status, date: new Date(2026, 7, day) });

/** One approved leave day. Defaults to a paid day on 10 August 2026. */
const leave = (overrides = {}) => ({
  status: "approved",
  type: "paid",
  isHalfDay: false,
  isDoubleDeduction: false,
  startDate: new Date(2026, 7, 10),
  endDate: new Date(2026, 7, 10),
  ...overrides,
});

/** An approved leave day of `type` on a given August day. */
const leaveOn = (day, overrides = {}) =>
  leave({ startDate: new Date(2026, 7, day), endDate: new Date(2026, 7, day), ...overrides });

/** `count` approved unpaid leave days, each on its own date. */
const unpaidDays = (count, from = 1) =>
  Array.from({ length: count }, (_, index) => leaveOn(from + index, { type: "unpaid" }));

beforeEach(() => {
  nextDay = 1;
});

describe("per-day rate uses CALENDAR days", () => {
  it("divides by 31 in August, not by working days", () => {
    // Working days (~22) would give 1363.64 — about 30% more deducted for the
    // same absence.
    expect(perDayRate(30000, 2026, 8)).toBeCloseTo(967.74, 2);
  });

  it("divides by 28 in a non-leap February and 29 in a leap one", () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(perDayRate(28000, 2026, 2)).toBeCloseTo(1000, 5);
  });

  it("uses 30 for a 30-day month", () => {
    expect(daysInMonth(2026, 9)).toBe(30);
  });
});

describe("the worked case", () => {
  it("salary 30000, 31 days, 3 absent → 1 paid, 2 unpaid, deduction 1935, net 28065", () => {
    const result = computeEmployeeMonth({
      user: user(),
      // Three approved LEAVE days: the month's paid day plus two unpaid.
      // Absence is leave-sourced now, so this is what "3 absent" means here.
      leaves: [leave(), ...unpaidDays(2)],
      year: 2026,
      month: 8,
    });

    expect(result.absentDays).toBe(3);
    expect(result.paidLeave).toBe(1);
    expect(result.unpaidLeave).toBe(2);
    expect(result.deduction).toBe(1935);
    expect(result.netPayable).toBe(28065);
  });
});

describe("the one-paid-day cap", () => {
  it("never credits more than 1 paid day, however many were approved", () => {
    // §11.7 is enforced at approval too; the cap is repeated here so a report
    // cannot silently misreport if a second approved day ever gets in.
    const result = computeEmployeeMonth({
      user: user(),
      // Two paid days approved in one month (which approval should prevent)
      // plus one unpaid: 3 days away, only 1 of them creditable.
      leaves: [leaveOn(10), leaveOn(12), ...unpaidDays(1, 20)],
      year: 2026,
      month: 8,
    });

    expect(result.absentDays).toBe(3);
    expect(result.paidLeave).toBe(1);
    expect(result.unpaidLeave).toBe(2);
  });

  it("cannot be fooled by the on_leave/absent status split, whatever Attendance says", () => {
    // The bug 0aba084 fixed: approving a full-day leave writes `on_leave`, not
    // `absent`, and reading that status wrongly subtracted the paid allowance
    // from a total it had never joined. Sourcing absence from the Leave record
    // removes the status question altogether — the Attendance rows below
    // contradict each other on purpose and change nothing.
    const result = computeEmployeeMonth({
      user: user(),
      attendance: [record("present", 5), record("on_leave", 10), record("absent", 25)],
      leaves: [leave(), ...unpaidDays(2)],
      year: 2026,
      month: 8,
    });

    expect(result.absentDays).toBe(3);
    expect(result.paidLeave).toBe(1);
    expect(result.unpaidLeave).toBe(2);
    expect(result.deduction).toBe(1935);
  });

  it("a half-day paid leave covers exactly its own half day", () => {
    const result = computeEmployeeMonth({
      user: user(),
      leaves: [leave({ isHalfDay: true })],
      year: 2026,
      month: 8,
    });

    expect(result.absentDays).toBe(0.5);
    expect(result.paidLeave).toBe(0.5);
    expect(result.unpaidLeave).toBe(0);
    expect(result.deduction).toBe(0);
  });

  it("does not count a PENDING or REJECTED paid request", () => {
    const result = computeEmployeeMonth({
      user: user(),
      // Neither is approved, so neither is a day away NOR a paid day.
      leaves: [leave({ status: "pending" }), leave({ status: "rejected" })],
      year: 2026,
      month: 8,
    });

    // A request that was never granted is not a day away at all, so it is
    // neither absent nor unpaid — not "unpaid because it wasn't the paid one".
    expect(result.absentDays).toBe(0);
    expect(result.paidLeave).toBe(0);
    expect(result.unpaidLeave).toBe(0);
    expect(result.deduction).toBe(0);
  });
});

describe("half days count 0.5", () => {
  it("counts a half-day leave as half a day away", () => {
    const result = computeEmployeeMonth({
      user: user(),
      leaves: [leaveOn(10, { type: "unpaid", isHalfDay: true })],
      year: 2026,
      month: 8,
    });

    expect(result.absentDays).toBe(0.5);
  });

  it("carries 0.5 through to the deduction", () => {
    const result = computeEmployeeMonth({
      user: user(),
      leaves: [leaveOn(10, { type: "unpaid", isHalfDay: true })],
      year: 2026,
      month: 8,
    });

    // 0.5 unpaid × 967.74 = 483.87 -> 484
    expect(result.unpaidLeave).toBe(0.5);
    expect(result.deduction).toBe(484);
  });

  it("still reports presentDays from Attendance for Payroll, though no column shows it", () => {
    // The Present COLUMN is gone (§7.50); the figure stays because Payroll
    // derives gross pay from it and must eventually consume this service.
    const result = computeEmployeeMonth({
      user: user(),
      attendance: [record("present"), record("half_day")],
      leaves: [],
      year: 2026,
      month: 8,
    });

    expect(result.presentDays).toBe(1.5);
    // ...and that Attendance contributes NOTHING to absence any more.
    expect(result.absentDays).toBe(0);
  });
});

describe("absence is LEAVE-sourced, not attendance-sourced (§7.50)", () => {
  it("does NOT count a roster-marked absence with no leave record behind it", () => {
    // A deliberate reversal of part of 0aba084: that reconciliation was right
    // for an attendance report, and this is a leave report. The consequence is
    // real and intended — a roster-marked absence alone is not deducted here.
    const result = computeEmployeeMonth({
      user: user(),
      attendance: [record("absent", 4), record("absent", 5), record("half_day", 6)],
      leaves: [],
      year: 2026,
      month: 8,
    });

    expect(result.absentDays).toBe(0);
    expect(result.unpaidLeave).toBe(0);
    expect(result.deduction).toBe(0);
    expect(result.netPayable).toBe(30000);
  });

  it("counts every APPROVED leave type as a day away", () => {
    const result = computeEmployeeMonth({
      user: user(),
      leaves: [
        leaveOn(3),
        leaveOn(4, { type: "unpaid" }),
        leaveOn(5, { type: "unapproved_absence", isDoubleDeduction: true }),
      ],
      year: 2026,
      month: 8,
    });

    expect(result.absentDays).toBe(3);
  });

  it("ignores a leave record belonging to another month", () => {
    const result = computeEmployeeMonth({
      user: user(),
      leaves: [leave({ startDate: new Date(2026, 6, 10), endDate: new Date(2026, 6, 10) })],
      year: 2026,
      month: 8,
    });

    expect(result.absentDays).toBe(0);
  });
});

describe("unapproved absence deducts twice, visibly", () => {
  it("charges 2 days for one unapproved absence — the day itself plus the surcharge", () => {
    // The bug 0aba084 fixed, and it stays fixed for a different reason:
    // `markUnapprovedAbsence` writes NO Attendance record, which cannot bite a
    // calculation that never reads Attendance. The Leave row is the absent day.
    const result = computeEmployeeMonth({
      user: user(),
      attendance: [record("present", 3), record("present", 4)],
      leaves: [leave({ type: "unapproved_absence", isDoubleDeduction: true })],
      year: 2026,
      month: 8,
    });

    expect(result.absentDays).toBe(1);
    expect(result.unpaidLeave).toBe(1);
    expect(result.doubleDeductionDays).toBe(1);
    expect(result.deduction).toBe(1935);
  });

  it("counts a multi-day unapproved absence once per date", () => {
    const result = computeEmployeeMonth({
      user: user(),
      attendance: [],
      leaves: [
        leave({
          type: "unapproved_absence",
          isDoubleDeduction: true,
          startDate: new Date(2026, 7, 10),
          endDate: new Date(2026, 7, 12),
        }),
      ],
      year: 2026,
      month: 8,
    });

    // 3 dates, none of them paid leave (an unapproved absence is never the
    // month's paid day), so 3 unpaid + a 3-day surcharge = 6 days deducted.
    expect(result.absentDays).toBe(3);
    expect(result.unpaidLeave).toBe(3);
    expect(result.doubleDeductionDays).toBe(3);
    expect(result.deduction).toBe(Math.round(6 * (30000 / 31)));
  });

  it("reports zero doubled days when nothing is unapproved, so no marker shows", () => {
    const result = computeEmployeeMonth({
      user: user(),
      leaves: [leaveOn(10, { type: "unpaid" })],
      year: 2026,
      month: 8,
    });

    expect(result.doubleDeductionDays).toBe(0);
    expect(result.deduction).toBe(968);
  });
});

describe("an unset baseSalary is NOT zero", () => {
  it.each([[null], [undefined], [0]])("returns null for salary %p, never a computed ₹0", (value) => {
    const result = computeEmployeeMonth({
      user: user({ baseSalary: value }),
      leaves: unpaidDays(2),
      year: 2026,
      month: 8,
    });

    // "Net Payable ₹0" reads as "this person earned nothing". It actually
    // means nobody recorded what they are paid — a different statement.
    expect(result.baseSalary).toBeNull();
    expect(result.deduction).toBeNull();
    expect(result.netPayable).toBeNull();
    // Leave is still counted — only the money is unknown.
    expect(result.absentDays).toBe(2);
  });
});

describe("the annual balance columns (§7.49)", () => {
  const august = { year: 2026, month: 8 };

  /** An approved paid leave on a single date. */
  const paidOn = (month, day, overrides = {}) =>
    leave({
      startDate: new Date(2026, month - 1, day),
      endDate: new Date(2026, month - 1, day),
      ...overrides,
    });

  it("shows a full 12 for someone who has taken no paid leave this year", () => {
    const result = computeEmployeeMonth({
      user: user(),
      attendance: [],
      leaves: [],
      ...august,
    });

    expect(result.oldBalance).toBe(12);
    expect(result.monthCredit).toBe(1);
    expect(result.balance).toBe(12);
  });

  it("subtracts prior months from Old Balance and this month from Balance", () => {
    // Three paid days used earlier in 2026 (Feb, April, June — one a month, as
    // the approval rule enforces), and a fourth this month.
    const result = computeEmployeeMonth({
      user: user(),
      leaves: [paidOn(2, 3), paidOn(4, 9), paidOn(6, 21), paidOn(8, 10)],
      ...august,
    });

    expect(result.oldBalance).toBe(9);
    expect(result.paidLeave).toBe(1);
    expect(result.balance).toBe(8);
  });

  it("leaves Balance equal to Old Balance when this month's day goes unused", () => {
    const result = computeEmployeeMonth({
      user: user(),
      attendance: [],
      leaves: [paidOn(2, 3), paidOn(4, 9)],
      ...august,
    });

    // The credit accrues whether or not it is spent, so the column still reads
    // 1 — but an unused day does not move the balance.
    expect(result.oldBalance).toBe(10);
    expect(result.monthCredit).toBe(1);
    expect(result.balance).toBe(10);
  });

  it("counts a half-day paid leave as 0.5 against the balance", () => {
    const result = computeEmployeeMonth({
      user: user(),
      leaves: [paidOn(3, 4, { isHalfDay: true }), paidOn(8, 10, { isHalfDay: true })],
      ...august,
    });

    expect(result.oldBalance).toBe(11.5);
    expect(result.paidLeave).toBe(0.5);
    expect(result.balance).toBe(11);
  });

  it("does not count a half-day leave that falls outside the window at all", () => {
    // `isHalfDay ? 0.5 : count` returned 0.5 for a leave entirely outside the
    // range — invisible while only one month was ever queried, wrong the moment
    // a year-to-date window existed.
    const result = computeEmployeeMonth({
      user: user(),
      attendance: [],
      leaves: [
        {
          ...paidOn(1, 5, { isHalfDay: true }),
          startDate: new Date(2025, 10, 5),
          endDate: new Date(2025, 10, 5),
        },
      ],
      ...august,
    });

    expect(result.oldBalance).toBe(12);
    expect(result.balance).toBe(12);
  });

  it("does not count pending or rejected paid requests against the balance", () => {
    const result = computeEmployeeMonth({
      user: user(),
      attendance: [],
      leaves: [paidOn(3, 4, { status: "pending" }), paidOn(5, 6, { status: "rejected" })],
      ...august,
    });

    expect(result.oldBalance).toBe(12);
    expect(result.balance).toBe(12);
  });

  it("does not count UNPAID or unapproved-absence leave against the paid balance", () => {
    const result = computeEmployeeMonth({
      user: user(),
      attendance: [],
      leaves: [
        paidOn(3, 4, { type: "unpaid" }),
        paidOn(5, 6, { type: "unapproved_absence", isDoubleDeduction: true }),
      ],
      ...august,
    });

    expect(result.balance).toBe(12);
  });

  it("RESETS in January — last year's usage does not follow the employee in", () => {
    const result = computeEmployeeMonth({
      user: user(),
      attendance: [],
      leaves: [
        // Five days spent across 2025, all before the boundary.
        ...[3, 5, 7, 9, 11].map((month) => ({
          ...leave(),
          startDate: new Date(2025, month - 1, 4),
          endDate: new Date(2025, month - 1, 4),
        })),
      ],
      year: 2026,
      month: 1,
    });

    expect(result.oldBalance).toBe(12);
    expect(result.balance).toBe(12);
  });

  it("puts the year boundary in ONE place, so a financial year is one change", () => {
    // The boundary is a named constant + `leaveYearStart`, not a `new Date(y, 0,
    // 1)` repeated through the balance maths.
    expect(ANNUAL_PAID_LEAVE_DAYS).toBe(12);
    expect(leaveYearStart(2026, 8).getFullYear()).toBe(2026);
    expect(leaveYearStart(2026, 8).getMonth()).toBe(0);
    expect(leaveYearStart(2026, 1).getMonth()).toBe(0);
    // Reported on every row, so the UI never has to re-derive it.
    const result = computeEmployeeMonth({ user: user(), attendance: [], leaves: [], ...august });
    expect(result.leaveYear).toBe("2026");
  });

  it("leaves deduction and net payable untouched", () => {
    // The balance columns are derived reporting only — they must not move a
    // single rupee of the figures the previous task locked in.
    const result = computeEmployeeMonth({
      user: user(),
      leaves: [paidOn(8, 10), ...unpaidDays(2)],
      ...august,
    });

    expect(result.deduction).toBe(1935);
    expect(result.netPayable).toBe(28065);
  });
});

describe("an employee with nothing recorded", () => {
  it("still produces a row, with zeroes rather than absence", () => {
    const result = computeEmployeeMonth({
      user: user(),
      attendance: [],
      leaves: [],
      year: 2026,
      month: 8,
    });

    expect(result.presentDays).toBe(0);
    expect(result.absentDays).toBe(0);
    expect(result.deduction).toBe(0);
    expect(result.netPayable).toBe(30000);
  });
});
