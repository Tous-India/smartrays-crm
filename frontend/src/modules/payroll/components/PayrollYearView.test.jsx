import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import dayjs from "dayjs";
import PayrollYearView from "./PayrollYearView";
import { message } from "antd";
import * as payrollApi from "../api/payrollApi";

vi.mock("antd", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, message: { ...actual.message, success: vi.fn(), error: vi.fn() } };
});

vi.mock("../api/payrollApi", () => ({
  getPayrollPeriods: vi.fn(),
  runPayrollDraft: vi.fn(),
  getPeriodReview: vi.fn(),
  submitPeriodForReview: vi.fn(),
  approvePeriod: vi.fn(),
  markPeriodPaid: vi.fn(),
  createAdjustment: vi.fn(),
}));

/**
 * §7.57 — the `/payroll` page. NEW component: the page was a placeholder, so
 * these do not fail against a previous version of it.
 *
 * What they pin is the single entry point (year → run → review table) and the
 * property that makes the list worth having: a month with no run is a ROW, not
 * an omission.
 */

const THIS_YEAR = dayjs().year();

function period(month, overrides = {}) {
  return {
    month,
    year: THIS_YEAR,
    status: null,
    employeeCount: 0,
    grossTotal: 0,
    deductionTotal: 0,
    netTotal: 0,
    generatedBy: null,
    adjustmentTotal: 0,
    generatedAt: null,
    approvedBy: null,
    approvedAt: null,
    paidAt: null,
    ...overrides,
  };
}

function respondWith({ rows, years = [THIS_YEAR, THIS_YEAR - 1] } = {}) {
  const full =
    rows ||
    Array.from({ length: 12 }, (_unused, index) => period(12 - index));

  payrollApi.getPayrollPeriods.mockResolvedValue({
    data: { data: { year: THIS_YEAR, years, rows: full } },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  respondWith();
  payrollApi.getPeriodReview.mockResolvedValue({
    data: {
      data: {
        month: 6, year: THIS_YEAR, status: "draft",
        totals: { employees: 0, withRecord: 0, flagged: 0, gross: 0, deduction: 0, bonus: 0, otherDeductions: 0, net: 0 },
        rows: [],
      },
    },
  });
});

describe("the year dropdown", () => {
  it("defaults to the current year and asks the server for it", async () => {
    render(<PayrollYearView />);

    await waitFor(() =>
      expect(payrollApi.getPayrollPeriods).toHaveBeenCalledWith({ year: THIS_YEAR })
    );
    expect(await screen.findByText(String(THIS_YEAR))).toBeInTheDocument();
  });

  it("re-fetches when another year is chosen", async () => {
    render(<PayrollYearView />);
    await screen.findByText("June");

    await userEvent.click(document.querySelector(".ant-select-selector"));
    await userEvent.click(await screen.findByTitle(String(THIS_YEAR - 1)));

    await waitFor(() =>
      expect(payrollApi.getPayrollPeriods).toHaveBeenCalledWith({ year: THIS_YEAR - 1 })
    );
  });
});

describe("the run list", () => {
  it("lists all twelve months, most recent first", async () => {
    render(<PayrollYearView />);

    await screen.findByText("December");
    const bodyRows = document.querySelectorAll(".ant-table-tbody tr.ant-table-row");

    expect(bodyRows).toHaveLength(12);
    expect(bodyRows[0].textContent).toContain("December");
    expect(bodyRows[11].textContent).toContain("January");
  });

  it("shows a month with NO run as a row rather than omitting it", async () => {
    // A payroll that silently skipped a month is exactly what this list is for.
    render(<PayrollYearView />);

    const march = await screen.findByRole("row", { name: /March/ });
    expect(within(march).getByText("No run")).toBeInTheDocument();
  });

  it("shows state, employee count and totals for a month that has one", async () => {
    respondWith({
      rows: [
        period(6, {
          status: "draft",
          employeeCount: 4,
          grossTotal: 120000,
          netTotal: 114500,
          generatedAt: "2026-07-01T09:00:00.000Z",
        }),
      ],
    });

    render(<PayrollYearView />);

    await screen.findByText("June");
    const june = document.querySelector(".ant-table-tbody tr.ant-table-row").textContent;

    expect(june).toContain("draft");
    expect(june).toContain("4");
    // `toLocaleString()` follows the environment's locale — jsdom groups the
    // Indian way (1,20,000), a browser here groups 120,000. Assert the figure,
    // not a grouping this test does not control.
    expect(june.replace(/,/g, "")).toContain("₹120000");
    expect(june.replace(/,/g, "")).toContain("₹114500");
  });

  it("names who approved, and shows the payment date once paid", async () => {
    respondWith({
      rows: [
        period(5, {
          status: "approved", employeeCount: 2, approvedBy: "Vinay",
          approvedAt: "2026-06-02T00:00:00.000Z",
        }),
        period(4, {
          status: "paid", employeeCount: 2, approvedBy: "Vinay",
          approvedAt: "2026-05-02T00:00:00.000Z", paidAt: "2026-05-05T00:00:00.000Z",
        }),
      ],
    });

    render(<PayrollYearView />);

    await screen.findByText("May");
    const rows = [...document.querySelectorAll(".ant-table-tbody tr.ant-table-row")];

    expect(rows[0].textContent).toContain("Vinay");
    expect(rows[1].textContent).toContain("Paid 5 May 2026");
  });

  it("opens the existing review table when a run is clicked", async () => {
    respondWith({ rows: [period(6, { status: "draft", employeeCount: 1 })] });

    render(<PayrollYearView />);
    await userEvent.click(await screen.findByText("June"));

    // The review screen from §7.54, not a rebuild of it.
    expect(await screen.findByRole("button", { name: /← All pay runs/ })).toBeInTheDocument();
    await waitFor(() => expect(payrollApi.getPeriodReview).toHaveBeenCalled());
  });

  it("does NOT open a month with no run", async () => {
    render(<PayrollYearView />);
    await userEvent.click(await screen.findByText("March"));

    expect(screen.queryByRole("button", { name: /← All pay runs/ })).not.toBeInTheDocument();
  });
});

describe("Run payroll", () => {
  it("opens a modal defaulting to the current month", async () => {
    render(<PayrollYearView />);

    await userEvent.click(await screen.findByRole("button", { name: /run payroll/i }));

    expect(await screen.findByText("This generates a DRAFT.")).toBeInTheDocument();
    expect(screen.getByLabelText("Payroll period")).toHaveValue(dayjs().format("YYYY-MM"));
  });

  it("generates a draft for the chosen period", async () => {
    payrollApi.runPayrollDraft.mockResolvedValue({ data: {} });

    render(<PayrollYearView />);
    await userEvent.click(await screen.findByRole("button", { name: /run payroll/i }));
    await userEvent.click(await screen.findByRole("button", { name: /generate draft/i }));

    await waitFor(() =>
      expect(payrollApi.runPayrollDraft).toHaveBeenCalledWith(
        expect.objectContaining({ year: dayjs().year(), month: dayjs().month() + 1 })
      )
    );
  });

  it("SURFACES the 409 when the month is already approved, rather than failing silently", async () => {
    payrollApi.runPayrollDraft.mockRejectedValue({
      response: { data: { message: "Payroll for 6/2026 is approved and can no longer be recomputed." } },
    });

    render(<PayrollYearView />);
    await userEvent.click(await screen.findByRole("button", { name: /run payroll/i }));
    await userEvent.click(await screen.findByRole("button", { name: /generate draft/i }));

    // The server's own sentence is the useful one — "already approved" is what
    // tells the admin why, and swallowing it would make the button look broken
    // rather than refused.
    await waitFor(() =>
      expect(message.error).toHaveBeenCalledWith(
        "Payroll for 6/2026 is approved and can no longer be recomputed."
      )
    );
  });
});


describe("Scope 1 columns (§7.58)", () => {
  it("shows total deductions and who generated the run", async () => {
    respondWith({
      rows: [
        period(6, {
          status: "draft", employeeCount: 4, grossTotal: 120000,
          deductionTotal: 5500, netTotal: 114500,
          generatedAt: "2026-07-01T09:00:00.000Z", generatedBy: "Vinay",
        }),
      ],
    });

    render(<PayrollYearView />);

    await screen.findByText("June");
    const june = document.querySelector(".ant-table-tbody tr.ant-table-row").textContent;

    expect(june.replace(/,/g, "")).toContain("₹5500");
    expect(june).toContain("Vinay");
  });

  it("renders a NULL generator as an em dash, never as an automatic label", async () => {
    // node-cron does not run on Vercel serverless, so no record was ever
    // cron-generated. Calling null "Automatic" would assert something false
    // about every row written before the field existed.
    respondWith({
      rows: [period(6, { status: "draft", employeeCount: 1, generatedBy: null })],
    });

    render(<PayrollYearView />);

    await screen.findByText("June");
    const june = document.querySelector(".ant-table-tbody tr.ant-table-row").textContent;

    expect(june).not.toMatch(/automatic/i);
    expect(june).not.toMatch(/cron/i);
    expect(june).toContain("—");
  });
});

describe("the Run Payroll modal warns precisely (§7.58)", () => {
  it("says re-running REPLACES an existing draft, not duplicates it", async () => {
    respondWith({
      rows: [period(dayjs().month() + 1, { status: "draft", employeeCount: 1 })],
    });

    render(<PayrollYearView />);
    await userEvent.click(await screen.findByRole("button", { name: /run payroll/i }));

    expect(await screen.findByText(/A run already exists for/)).toBeInTheDocument();
    expect(screen.getByText(/REPLACES the existing draft in place/)).toBeInTheDocument();
    expect(screen.getByText(/does not create a second one/)).toBeInTheDocument();
  });

  it("says an approved run will be REFUSED, and does not block the attempt", async () => {
    respondWith({
      rows: [period(dayjs().month() + 1, { status: "approved", employeeCount: 1 })],
    });

    render(<PayrollYearView />);
    await userEvent.click(await screen.findByRole("button", { name: /run payroll/i }));

    expect(await screen.findByText(/frozen — this will be REFUSED/)).toBeInTheDocument();
    // Warned, not blocked.
    expect(screen.getByRole("button", { name: /generate draft/i })).toBeEnabled();
  });
});

describe("when a year has no runs at all", () => {
  it("says so rather than showing an empty table", async () => {
    respondWith({ rows: [] });

    render(<PayrollYearView />);

    expect(await screen.findByText(`No pay runs in ${THIS_YEAR} yet.`)).toBeInTheDocument();
  });
});
