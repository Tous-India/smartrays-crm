import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import dayjs from "dayjs";
import MonthlyReportSection from "./MonthlyReportSection";
import * as payrollApi from "../../payroll/api/payrollApi";

vi.mock("../../payroll/api/payrollApi", () => ({
  getMonthlyReport: vi.fn(),
}));

/**
 * §7.47 — the Report tab.
 *
 * NEW component, no prior version, so there was nothing for these to fail
 * against. What they pin is the set of readings that would be wrong on a
 * screen showing salaries: a computed ₹0 where nothing was recorded, a
 * deduction that silently disagrees with its own day count, and half days
 * rounded away.
 */

function row(overrides = {}) {
  return {
    employeeId: "u1",
    name: "Asha Verma",
    baseSalary: 30000,
    calendarDays: 31,
    leaveYear: "2026",
    oldBalance: 10,
    monthCredit: 1,
    balance: 9,
    presentDays: 28,
    absentDays: 3,
    paidLeave: 1,
    unpaidLeave: 2,
    doubleDeductionDays: 0,
    deduction: 1935,
    netPayable: 28065,
    ...overrides,
  };
}

function respondWith(rows) {
  payrollApi.getMonthlyReport.mockResolvedValue({
    data: { data: { year: 2026, month: 8, rows } },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  respondWith([row()]);
});

describe("the report table", () => {
  it("renders the worked case as the backend computed it", async () => {
    render(<MonthlyReportSection />);

    const cells = await screen.findByRole("row", { name: /Asha Verma/ });

    expect(within(cells).getByText("₹30,000")).toBeInTheDocument();
    // 3 days of leave: 1 paid, 2 unpaid. `presentDays` is deliberately not on
    // this table any more (§7.50).
    expect(within(cells).getByText("3")).toBeInTheDocument();
    expect(within(cells).getByText("₹1,935")).toBeInTheDocument();
    expect(within(cells).getByText("₹28,065")).toBeInTheDocument();
  });

  it("keeps Base Salary and Net Payable as distinct headers", async () => {
    render(<MonthlyReportSection />);

    // One is stored, the other derived. A single "Salary" column would blur
    // what the reader is looking at. Both carry "(monthly)" beneath, so the
    // accessible name includes it.
    expect(await screen.findByRole("columnheader", { name: /Base Salary/ })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /Net Payable/ })).toBeInTheDocument();
  });

  it("shows an em dash, NOT ₹0, when no base salary is recorded", async () => {
    respondWith([
      row({ baseSalary: null, deduction: null, netPayable: null, name: "Ravi Kumar" }),
    ]);

    render(<MonthlyReportSection />);

    const cells = await screen.findByRole("row", { name: /Ravi Kumar/ });

    // "₹0 Net Payable" reads as a real figure — someone earned nothing. It
    // actually means nobody recorded what they are paid.
    expect(within(cells).queryByText("₹0")).not.toBeInTheDocument();
    expect(within(cells).getAllByText("—").length).toBeGreaterThan(0);
    // The leave columns still carry their real counts.
    expect(within(cells).getByText("3")).toBeInTheDocument();
  });

  it("shows half days as 0.5 rather than rounding them away", async () => {
    respondWith([row({ absentDays: 0.5, paidLeave: 0.5, unpaidLeave: 0 })]);

    render(<MonthlyReportSection />);

    const cells = await screen.findByRole("row", { name: /Asha Verma/ });

    // Absent and Paid Leave, both halves — not rounded to 0 or 1.
    expect(within(cells).getAllByText("0.5").length).toBe(2);
  });
});

describe("Base Salary is shown as a MONTHLY figure (§7.52)", () => {
  it("labels both money headers with their basis", async () => {
    // An annual figure entered as the base salary produces a Net Payable
    // roughly 12x too high, silently. Base Salary and Net Payable sit in the
    // same money group, so saying "(monthly)" on both makes the shared basis
    // visible rather than something to infer.
    render(<MonthlyReportSection />);

    const salary = await screen.findByRole("columnheader", { name: /Base Salary/ });
    const net = screen.getByRole("columnheader", { name: /Net Payable/ });

    expect(salary.textContent).toContain("(monthly)");
    expect(net.textContent).toContain("(monthly)");
  });

  it("says in the subheading that the per-day rate divides the MONTHLY salary", async () => {
    render(<MonthlyReportSection />);

    expect(await screen.findByText(/per-day rate is the/)).toBeInTheDocument();
    expect(screen.getByText("monthly")).toBeInTheDocument();
  });
});

describe("the annual balance columns (§7.49)", () => {
  it("renders Old Balance, This Month Credit and Balance in the specified order", async () => {
    render(<MonthlyReportSection />);

    const headers = (await screen.findAllByRole("columnheader")).map((h) => h.textContent.trim());

    // No Present column (§7.50) — a leave report, not an attendance report.
    // The two money headers carry their basis on a second line, so their
    // textContent runs together — the ORDER is what this pins.
    expect(headers).toEqual([
      "Employee",
      "Base Salary(monthly)",
      "Old Balance",
      "This Month Credit",
      "Absent",
      "Paid Leave",
      "Unpaid Leave",
      "Deduction",
      "Net Payable(monthly)",
      "Balance",
    ]);
    expect(headers).not.toContain("Present");
  });

  it("shows the balance figures the backend computed, without re-deriving them", async () => {
    respondWith([row({ oldBalance: 9, monthCredit: 1, balance: 8 })]);

    render(<MonthlyReportSection />);

    const cells = (await screen.findByRole("row", { name: /Asha Verma/ })).querySelectorAll("td");
    const text = [...cells].map((c) => c.textContent.trim());

    // Positions 2, 3 and 9 in the ten-column order above.
    expect(text[2]).toBe("9");
    expect(text[3]).toBe("1");
    expect(text[9]).toBe("8");
  });

  it("shows halves as 0.5 in the balance columns too", async () => {
    respondWith([row({ oldBalance: 11.5, monthCredit: 1, balance: 11, paidLeave: 0.5 })]);

    render(<MonthlyReportSection />);

    const cells = (await screen.findByRole("row", { name: /Asha Verma/ })).querySelectorAll("td");

    expect(cells[2].textContent.trim()).toBe("11.5");
  });

  it("names the leave year the balance is measured against", async () => {
    render(<MonthlyReportSection />);

    expect(
      await screen.findByText(/balance is out of 12 for the 2026 leave year \(Jan–Dec\)/)
    ).toBeInTheDocument();
  });

  it("says in the subheading that Absent means leave days, not attendance", async () => {
    // On a page called Attendance, a column called Absent will be read as the
    // attendance number unless the header says otherwise.
    render(<MonthlyReportSection />);

    expect(await screen.findByText(/Absent counts leave days/)).toBeInTheDocument();
    expect(screen.getByText(/not roster-marked attendance/)).toBeInTheDocument();
  });

  it("still shows a balance for an employee with no base salary", async () => {
    // The balance is leave, not money — an unrecorded salary says nothing about
    // how much leave someone has left.
    respondWith([
      row({ baseSalary: null, deduction: null, netPayable: null, oldBalance: 12, balance: 12 }),
    ]);

    render(<MonthlyReportSection />);

    const cells = (await screen.findByRole("row", { name: /Asha Verma/ })).querySelectorAll("td");

    expect(cells[2].textContent.trim()).toBe("12");
    expect(cells[9].textContent.trim()).toBe("12");
  });
});

describe("column-group tints (§7.51)", () => {
  const GROUP_OF = {
    Employee: null,
    "Base Salary(monthly)": "report-col-money",
    "Old Balance": "report-col-entitlement",
    "This Month Credit": "report-col-entitlement",
    Absent: "report-col-consumption",
    "Paid Leave": "report-col-consumption",
    "Unpaid Leave": "report-col-consumption",
    Deduction: "report-col-money",
    "Net Payable(monthly)": "report-col-money",
    Balance: "report-col-entitlement",
  };

  it("tints header AND body cells of every column with its group", async () => {
    render(<MonthlyReportSection />);

    const headers = await screen.findAllByRole("columnheader");
    const cells = (await screen.findByRole("row", { name: /Asha Verma/ })).querySelectorAll("td");

    Object.entries(GROUP_OF).forEach(([title, group], index) => {
      const header = headers[index];
      const cell = cells[index];

      expect(header.textContent.trim()).toBe(title);

      if (group === null) {
        // Employee is the anchor — untinted is what makes the blocks either
        // side of it visible.
        expect(header.className).not.toMatch(/report-col-/);
        expect(cell.className).not.toMatch(/report-col-/);
        return;
      }

      // Header and body must agree; a column tinted in one and not the other
      // would read as a rendering fault rather than a grouping.
      expect(header.className).toContain(group);
      expect(cell.className).toContain(group);
    });
  });

  it("uses THREE tints for ten columns, not one per column", async () => {
    render(<MonthlyReportSection />);

    const headers = await screen.findAllByRole("columnheader");
    const groups = new Set(
      headers.map((h) => (h.className.match(/report-col-\w+/) || [])[0]).filter(Boolean)
    );

    // Ten distinct tints would flatten into noise and none would carry meaning.
    expect(groups.size).toBe(3);
  });

  it("gives Deduction and Net Payable the SAME tint, never one by value", async () => {
    // A red deduction or a green net payable would be the table passing
    // judgement on someone's pay. The tint marks the kind of column, nothing
    // more — so a loss and a gain look identical.
    respondWith([row({ deduction: 5000, netPayable: 25000 })]);

    render(<MonthlyReportSection />);

    const cells = (await screen.findByRole("row", { name: /Asha Verma/ })).querySelectorAll("td");

    expect(cells[7].className).toContain("report-col-money");
    expect(cells[8].className).toContain("report-col-money");
  });
});

describe("a doubled deduction says so", () => {
  it("marks the row and explains why the figure exceeds the day count", async () => {
    respondWith([row({ unpaidLeave: 1, doubleDeductionDays: 1, deduction: 1935 })]);

    render(<MonthlyReportSection />);

    // 1 unpaid day at 967.74 would be ₹968. The row shows ₹1,935, and a
    // deduction that silently disagrees with the column beside it reads as a
    // bug rather than a policy.
    expect(await screen.findByText("×2")).toBeInTheDocument();
    expect(screen.getByText(/deducted at twice the per-day rate/i)).toBeInTheDocument();
  });

  it("does NOT render on the zero row from the screenshot — 0 absent, 0 unpaid, no salary", async () => {
    // Testing User 2, exactly as reported: an unapproved-absence LEAVE row with
    // no matching Attendance record, so every visible column read zero, and no
    // base salary, so the deduction rendered "—". The marker pointed at nothing.
    respondWith([
      row({
        name: "Testing User 2",
        baseSalary: null,
        presentDays: 4,
        absentDays: 0,
        paidLeave: 0,
        unpaidLeave: 0,
        doubleDeductionDays: 1,
        deduction: null,
        netPayable: null,
      }),
    ]);

    render(<MonthlyReportSection />);

    const cells = await screen.findByRole("row", { name: /Testing User 2/ });

    expect(within(cells).queryByText("×2")).not.toBeInTheDocument();
    expect(screen.queryByText(/deducted at twice the per-day rate/i)).not.toBeInTheDocument();
  });

  it("does NOT render when the deduction is zero, however many doubled days are claimed", async () => {
    respondWith([row({ unpaidLeave: 0, doubleDeductionDays: 1, deduction: 0, netPayable: 30000 })]);

    render(<MonthlyReportSection />);

    const cells = await screen.findByRole("row", { name: /Asha Verma/ });

    expect(within(cells).queryByText("×2")).not.toBeInTheDocument();
  });

  it("suppresses the marker when there is no deduction figure to explain", async () => {
    // "—×2" claimed a doubling of an unknown number. The doubled days are real
    // but there is no salary to apply them to, so the cell says only that.
    respondWith([
      row({ baseSalary: null, deduction: null, netPayable: null, doubleDeductionDays: 1 }),
    ]);

    render(<MonthlyReportSection />);

    const cells = await screen.findByRole("row", { name: /Asha Verma/ });

    expect(within(cells).queryByText("×2")).not.toBeInTheDocument();
    // ...and no footnote either, which would otherwise explain a marker that
    // appears nowhere on screen.
    expect(screen.queryByText(/deducted at twice the per-day rate/i)).not.toBeInTheDocument();
  });

  it("shows no marker and no footnote when nothing was doubled", async () => {
    render(<MonthlyReportSection />);

    await screen.findByText("Asha Verma");

    expect(screen.queryByText("×2")).not.toBeInTheDocument();
    expect(screen.queryByText(/deducted at twice the per-day rate/i)).not.toBeInTheDocument();
  });
});

describe("the month filter", () => {
  it("defaults to the current month", async () => {
    render(<MonthlyReportSection />);

    await screen.findByText("Asha Verma");

    const now = dayjs();
    expect(payrollApi.getMonthlyReport).toHaveBeenCalledWith({
      year: now.year(),
      month: now.month() + 1,
    });
  });

  it("requests the previous month when asked", async () => {
    render(<MonthlyReportSection />);
    await screen.findByText("Asha Verma");

    // Radio inputs inside Segmented carry `pointer-events: none`.
    await userEvent.click(screen.getByText("Last month"), { pointerEventsCheck: 0 });

    const previous = dayjs().subtract(1, "month");
    expect(payrollApi.getMonthlyReport).toHaveBeenLastCalledWith({
      year: previous.year(),
      month: previous.month() + 1,
    });
  });

  it("reveals a month picker only for the custom option", async () => {
    render(<MonthlyReportSection />);
    await screen.findByText("Asha Verma");

    expect(screen.queryByLabelText("Choose month")).not.toBeInTheDocument();

    await userEvent.click(screen.getByText("Custom month"), { pointerEventsCheck: 0 });

    expect(screen.getByLabelText("Choose month")).toBeInTheDocument();
  });
});

describe("when the request fails", () => {
  it("says so instead of showing an empty table that reads as 'nobody worked'", async () => {
    payrollApi.getMonthlyReport.mockRejectedValue({
      response: { data: { message: "You do not have permission to perform this action" } },
    });

    render(<MonthlyReportSection />);

    expect(
      await screen.findByText("You do not have permission to perform this action")
    ).toBeInTheDocument();
  });
});
