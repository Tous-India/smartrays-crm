import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PayrollRunReview from "./PayrollRunReview";
import * as payrollApi from "../api/payrollApi";
import * as reportApi from "../../../services/reportApi";

vi.mock("../../../services/reportApi", () => ({
  generateReport: vi.fn(),
  triggerBlobDownload: vi.fn(),
}));

vi.mock("../api/payrollApi", () => ({
  getPeriodReview: vi.fn(),
  runPayrollDraft: vi.fn(),
  submitPeriodForReview: vi.fn(),
  approvePeriod: vi.fn(),
  markPeriodPaid: vi.fn(),
  createAdjustment: vi.fn(),
}));

/**
 * §7.54 — the pay run review screen. NEW component: there was no pay run and no
 * review screen before this, so these do not fail against a previous version.
 *
 * What they pin is the reason the screen exists — an admin has to see imperfect
 * inputs before they become somebody's pay — and the state machine that stops a
 * period being approved or paid out of order.
 */

function row(overrides = {}) {
  return {
    employeeId: "u1",
    payrollId: "p1",
    name: "Asha Verma",
    status: "draft",
    baseSalary: 30000,
    presentDays: 20,
    paidLeaveDays: 1,
    unpaidDeductionDays: 2,
    doubleDeductionDays: 0,
    grossAmount: 30000,
    deduction: 2000,
    adjustmentTotal: 0,
    bonusTotal: 0,
    otherDeductionTotal: 0,
    adjustmentLines: [],
    paidDays: 28,
    daysInMonth: 30,
    surchargeAmount: 0,
    absenceAmount: 2000,
    netAmount: 28000,
    anomalies: [],
    ...overrides,
  };
}

function respondWith({ status = "draft", rows = [row()], totals = {} } = {}) {
  payrollApi.getPeriodReview.mockResolvedValue({
    data: {
      data: {
        month: 7,
        year: 2026,
        status,
        totals: {
          employees: rows.length,
          withRecord: rows.filter((r) => r.status).length,
          flagged: rows.filter((r) => r.anomalies.length > 0).length,
          gross: rows.reduce((t, r) => t + (r.grossAmount || 0), 0),
          deduction: rows.reduce((t, r) => t + (r.deduction || 0), 0),
          bonus: rows.reduce((t, r) => t + (r.bonusTotal || 0), 0),
          otherDeductions: rows.reduce((t, r) => t + (r.otherDeductionTotal || 0), 0),
          net: rows.reduce((t, r) => t + (r.netAmount || 0), 0),
          ...totals,
        },
        rows,
      },
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  respondWith();
});

describe("anomalies are flagged, not blocked", () => {
  it("shows a tag per anomaly and still shows the row's pay", async () => {
    // Every flag here has a legitimate cause as well as a suspicious one, so
    // the screen draws the eye and a human decides — it never withholds.
    respondWith({
      rows: [
        row({
          anomalies: [
            { code: "HIGH_DEDUCTION", detail: "Deduction is 50% of gross" },
            { code: "UNAPPROVED_ABSENCE", detail: "2 day(s) charged at 2x" },
          ],
        }),
      ],
    });

    render(<PayrollRunReview />);

    const line = await screen.findByRole("row", { name: /Asha Verma/ });
    expect(within(line).getByText("High deduction")).toBeInTheDocument();
    expect(within(line).getByText("Unapproved absence")).toBeInTheDocument();
    // Flagged, not withheld.
    expect(within(line).getByText("₹28,000")).toBeInTheDocument();
  });

  it("distinguishes an employee with no salary from one with no record", async () => {
    respondWith({
      rows: [
        row({
          name: "Ravi Kumar",
          status: null,
          grossAmount: null,
          netAmount: null,
          anomalies: [
            { code: "NO_BASE_SALARY", detail: "No base salary recorded" },
            { code: "NO_RECORD", detail: "No payroll record for this period" },
          ],
        }),
      ],
    });

    render(<PayrollRunReview />);

    const line = await screen.findByRole("row", { name: /Ravi Kumar/ });
    expect(within(line).getByText("No salary set")).toBeInTheDocument();
    expect(within(line).getByText("No record")).toBeInTheDocument();
  });

  it("spells out the surcharge split rather than a bare ×2 (§7.58)", async () => {
    // "×2" read as though the WHOLE deduction had been doubled. It had not —
    // the doubling applied to a fraction of a day. The split is also what makes
    // the paidDays/net gap explainable from the row itself.
    respondWith({
      rows: [
        row({
          doubleDeductionDays: 0.5,
          unpaidDeductionDays: 4.5,
          deduction: 5161,
          absenceAmount: 4645,
          surchargeAmount: 516,
        }),
      ],
    });

    render(<PayrollRunReview />);

    expect(await screen.findByText(/₹4,645 \+ ₹516 \(0.5 day absence, 2×\)/)).toBeInTheDocument();
    expect(screen.queryByText("×2")).not.toBeInTheDocument();
  });
});

describe("the state machine gates every action", () => {
  it("only allows Send for review while the period is a draft", async () => {
    render(<PayrollRunReview />);
    await screen.findByText("Asha Verma");

    expect(screen.getByRole("button", { name: /send for review/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /^finalise$/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /mark paid/i })).toBeDisabled();
  });

  it("only allows Approve once the period is in review", async () => {
    respondWith({ status: "review", rows: [row({ status: "review" })] });

    render(<PayrollRunReview />);
    await screen.findByText("Asha Verma");

    expect(screen.getByRole("button", { name: /^finalise$/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /send for review/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /mark paid/i })).toBeDisabled();
  });

  it("refuses to regenerate a draft once the period is approved", async () => {
    // The freeze. Regenerating an approved period is exactly what must not be
    // possible — the server refuses too; this stops the button offering it.
    respondWith({ status: "approved", rows: [row({ status: "approved" })] });

    render(<PayrollRunReview />);
    await screen.findByText("Asha Verma");

    expect(screen.getByRole("button", { name: /regenerate draft/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /mark paid/i })).toBeEnabled();
  });

  it("says plainly that an approved period is frozen", async () => {
    respondWith({ status: "approved", rows: [row({ status: "approved" })] });

    render(<PayrollRunReview />);

    expect(await screen.findByText("This period is frozen.")).toBeInTheDocument();
    expect(
      screen.getByText(/editing attendance for this month will not change anyone's pay/i)
    ).toBeInTheDocument();
  });
});

describe("bonus and other deductions (§7.57)", () => {
  it("is EDITABLE on an open run", async () => {
    render(<PayrollRunReview />);
    await screen.findByText("Asha Verma");

    // Both money columns offer a way in while the run is still a draft.
    expect(screen.getAllByRole("button", { name: "Add" })).toHaveLength(2);
  });

  it("is READ-ONLY once approved — the freeze is the point", async () => {
    respondWith({
      status: "approved",
      rows: [row({ status: "approved", bonusTotal: 2000, otherDeductionTotal: 500 })],
    });

    render(<PayrollRunReview />);
    const line = await screen.findByRole("row", { name: /Asha Verma/ });

    // The figures still show; nothing offers to change them. Targeted by
    // column position — ₹2,000 is also this fixture's deduction.
    const cells = line.querySelectorAll("td");
    expect(cells[6].textContent).toContain("₹2,000"); // Bonus
    expect(cells[7].textContent).toContain("₹500"); // Other Deductions
    expect(within(line).queryByRole("button", { name: "Add" })).not.toBeInTheDocument();
  });

  it("signs a DEDUCTION negative from a positive input, so nobody has to remember", async () => {
    payrollApi.createAdjustment.mockResolvedValue({ data: {} });

    render(<PayrollRunReview />);
    await screen.findByText("Asha Verma");

    // The second "Add" is the Other Deductions column.
    await userEvent.click(screen.getAllByRole("button", { name: "Add" })[1]);
    expect(await screen.findByText("This is a line on this run.")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Amount"), "500");
    await userEvent.type(screen.getByLabelText("Reason"), "Equipment recovery");
    await userEvent.click(screen.getByRole("button", { name: /add deduction/i }));

    await waitFor(() =>
      expect(payrollApi.createAdjustment).toHaveBeenCalledWith(
        expect.objectContaining({ amount: -500, reason: "Equipment recovery" })
      )
    );
  });

  it("keeps a BONUS positive", async () => {
    payrollApi.createAdjustment.mockResolvedValue({ data: {} });

    render(<PayrollRunReview />);
    await screen.findByText("Asha Verma");

    await userEvent.click(screen.getAllByRole("button", { name: "Add" })[0]);
    await userEvent.type(screen.getByLabelText("Amount"), "3000");
    await userEvent.type(screen.getByLabelText("Reason"), "Diwali bonus");
    await userEvent.click(screen.getByRole("button", { name: /add bonus/i }));

    await waitFor(() =>
      expect(payrollApi.createAdjustment).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 3000, reason: "Diwali bonus" })
      )
    );
  });

  it("REQUIRES a reason — an amount on someone's pay with no reason is what an audit needs", async () => {
    render(<PayrollRunReview />);
    await screen.findByText("Asha Verma");

    await userEvent.click(screen.getAllByRole("button", { name: "Add" })[0]);
    await userEvent.type(screen.getByLabelText("Amount"), "3000");
    await userEvent.click(screen.getByRole("button", { name: /add bonus/i }));

    expect(await screen.findByText("A reason is required")).toBeInTheDocument();
    expect(payrollApi.createAdjustment).not.toHaveBeenCalled();
  });

  it("offers Correct only on a FROZEN run, where it lands on the next period", async () => {
    respondWith({ status: "approved", rows: [row({ status: "approved" })] });
    payrollApi.createAdjustment.mockResolvedValue({ data: {} });

    render(<PayrollRunReview />);
    await userEvent.click(await screen.findByRole("button", { name: "Correct" }));

    expect(await screen.findByText("History is not edited.")).toBeInTheDocument();
  });
});


describe("Scope 3 essentials (§7.58)", () => {
  it("renders the specced column order", async () => {
    render(<PayrollRunReview />);

    const heads = (await screen.findAllByRole("columnheader")).map((h) => h.textContent.trim());

    expect(heads.slice(0, 9)).toEqual([
      "Employee",
      "Base Salary",
      "Paid Days",
      "Paid Leave",
      "LOP Days",
      "LOP Deduction",
      "Bonus",
      "Other Deductions",
      "Net Payable",
    ]);
    // Days in Month is a property of the PERIOD, not of a row — same number on
    // every line, so it lives in the header.
    expect(heads).not.toContain("Days in Month");
  });

  it("puts Days in Month in the run header", async () => {
    render(<PayrollRunReview />);

    expect(await screen.findByText(/days in month/i)).toBeInTheDocument();
  });

  it("filters the rows by employee search", async () => {
    respondWith({
      rows: [row(), row({ employeeId: "u2", payrollId: "p2", name: "Rahul Nair" })],
    });

    render(<PayrollRunReview />);
    await screen.findByText("Rahul Nair");

    await userEvent.type(screen.getByLabelText("Find an employee"), "rahul");

    expect(screen.queryByText("Asha Verma")).not.toBeInTheDocument();
    expect(screen.getByText("Rahul Nair")).toBeInTheDocument();
  });

  it("exports the run through the SHARED report dispatcher, run-scoped", async () => {
    reportApi.generateReport.mockResolvedValue({ data: new Blob(["x"]) });

    render(<PayrollRunReview />);
    await screen.findByText("Asha Verma");
    await userEvent.click(screen.getByRole("button", { name: "Excel" }));

    await waitFor(() =>
      expect(reportApi.generateReport).toHaveBeenCalledWith(
        expect.objectContaining({ module: "payrollRun", format: "xlsx" })
      )
    );
    expect(reportApi.triggerBlobDownload).toHaveBeenCalled();
  });

  it("offers a payslip only once the run is finalised — a draft 409s by design", async () => {
    render(<PayrollRunReview />);
    await screen.findByText("Asha Verma");
    expect(screen.queryByRole("link", { name: "Payslip" })).not.toBeInTheDocument();

    respondWith({ status: "approved", rows: [row({ status: "approved" })] });
    render(<PayrollRunReview />);

    expect(await screen.findByRole("link", { name: "Payslip" })).toBeInTheDocument();
  });

  it("formats money as en-IN explicitly, not by whatever locale the runtime has", async () => {
    respondWith({ rows: [row({ grossAmount: 120000 })] });

    render(<PayrollRunReview />);

    // Lakh grouping, pinned — a bare toLocaleString() renders this differently
    // depending on where the process started.
    // Appears in the row AND the totals — both go through the same helper.
    expect((await screen.findAllByText("₹1,20,000")).length).toBeGreaterThan(0);
  });
});

describe("the totals row", () => {
  it("reconciles the aggregate an admin approves against", async () => {
    respondWith({
      rows: [
        row({ grossAmount: 30000, deduction: 2000, bonusTotal: 1000, otherDeductionTotal: 500, netAmount: 28500 }),
        row({ employeeId: "u2", payrollId: "p2", name: "Rahul Nair", grossAmount: 40000, deduction: 0, bonusTotal: 0, otherDeductionTotal: 0, netAmount: 40000 }),
      ],
    });

    render(<PayrollRunReview />);
    await screen.findByText("Rahul Nair");

    // Read off the summary row itself — ₹1,000 also appears in a body cell.
    const summary = document.querySelector(".ant-table-summary");
    const totals = [...summary.querySelectorAll("td")].map((cell) => cell.textContent.trim());

    expect(totals[0]).toBe("2 employees");
    expect(totals[4]).toBe("₹70,000"); // gross
    expect(totals[5]).toBe("₹2,000"); // deduction
    expect(totals[6]).toBe("₹1,000"); // bonus
    expect(totals[7]).toBe("₹500"); // other deductions
    expect(totals[8]).toBe("₹68,500"); // net
  });
});

describe("when the period has no run yet", () => {
  it("offers Generate draft and says nothing exists", async () => {
    respondWith({ status: null, rows: [] });

    render(<PayrollRunReview />);

    expect(await screen.findByRole("button", { name: /generate draft/i })).toBeEnabled();
    expect(screen.getByText(/no run generated for this period yet/i)).toBeInTheDocument();
  });
});
