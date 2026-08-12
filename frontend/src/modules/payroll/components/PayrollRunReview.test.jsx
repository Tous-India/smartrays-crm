import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PayrollRunReview from "./PayrollRunReview";
import * as payrollApi from "../api/payrollApi";

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

  it("marks a doubled deduction on the charged-days column", async () => {
    respondWith({ rows: [row({ doubleDeductionDays: 2, unpaidDeductionDays: 4 })] });

    render(<PayrollRunReview />);

    expect(await screen.findByText("×2")).toBeInTheDocument();
  });
});

describe("the state machine gates every action", () => {
  it("only allows Send for review while the period is a draft", async () => {
    render(<PayrollRunReview />);
    await screen.findByText("Asha Verma");

    expect(screen.getByRole("button", { name: /send for review/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /^approve$/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /mark paid/i })).toBeDisabled();
  });

  it("only allows Approve once the period is in review", async () => {
    respondWith({ status: "review", rows: [row({ status: "review" })] });

    render(<PayrollRunReview />);
    await screen.findByText("Asha Verma");

    expect(screen.getByRole("button", { name: /^approve$/i })).toBeEnabled();
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

describe("corrections", () => {
  it("offers Correct only on a frozen period", async () => {
    render(<PayrollRunReview />);
    await screen.findByText("Asha Verma");
    expect(screen.queryByRole("button", { name: "Correct" })).not.toBeInTheDocument();

    respondWith({ status: "approved", rows: [row({ status: "approved" })] });
    render(<PayrollRunReview />);

    expect(await screen.findByRole("button", { name: "Correct" })).toBeInTheDocument();
  });

  it("sends the amount and reason, and says history is not edited", async () => {
    respondWith({ status: "approved", rows: [row({ status: "approved" })] });
    payrollApi.createAdjustment.mockResolvedValue({ data: {} });

    render(<PayrollRunReview />);
    await userEvent.click(await screen.findByRole("button", { name: "Correct" }));

    expect(await screen.findByText("History is not edited.")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Amount"), "-1500");
    await userEvent.type(screen.getByLabelText("Reason"), "Roster mark was wrong");
    await userEvent.click(screen.getByRole("button", { name: /raise correction/i }));

    await waitFor(() =>
      expect(payrollApi.createAdjustment).toHaveBeenCalledWith(
        expect.objectContaining({ employeeId: "u1", amount: -1500, reason: "Roster mark was wrong" })
      )
    );
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
