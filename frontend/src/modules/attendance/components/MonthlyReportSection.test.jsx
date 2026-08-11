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
    expect(within(cells).getByText("28")).toBeInTheDocument();
    expect(within(cells).getByText("₹1,935")).toBeInTheDocument();
    expect(within(cells).getByText("₹28,065")).toBeInTheDocument();
  });

  it("keeps Base Salary and Net Payable as distinct headers", async () => {
    render(<MonthlyReportSection />);

    // One is stored, the other derived. A single "Salary" column would blur
    // what the reader is looking at.
    expect(await screen.findByRole("columnheader", { name: "Base Salary" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Net Payable" })).toBeInTheDocument();
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
    // The attendance columns still carry their real counts.
    expect(within(cells).getByText("28")).toBeInTheDocument();
  });

  it("shows half days as 0.5 rather than rounding them away", async () => {
    respondWith([row({ presentDays: 20.5, absentDays: 0.5, unpaidLeave: 0.5 })]);

    render(<MonthlyReportSection />);

    const cells = await screen.findByRole("row", { name: /Asha Verma/ });

    expect(within(cells).getByText("20.5")).toBeInTheDocument();
    expect(within(cells).getAllByText("0.5").length).toBe(2);
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
