import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ReportsPageContent from "./ReportsPageContent";
import useSessionStore from "../../../store/sessionStore";

// Composition-level test — mocks every chart/list section itself (rather
// than `@ant-design/charts`, jsdom has no canvas support so real charts
// can't render at all, see `analyticsCharts.test.jsx`'s own comment) so this
// file can focus purely on section-level permission-gating and the shared
// date-range filter being wired through to the trend sections, matching
// `DashboardPage.test.jsx`'s own composition-vs-widget-internals split.
vi.mock("./LeadsPipelineChart", () => ({ default: () => <div>LeadsPipelineChart</div> }));
vi.mock("./LeadsConversionChart", () => ({
  default: ({ dateRange }) => <div>LeadsConversionChart:{JSON.stringify(dateRange)}</div>,
}));
vi.mock("./LeadsBySourceChart", () => ({ default: () => <div>LeadsBySourceChart</div> }));
vi.mock("./LeadsByClientTypeChart", () => ({ default: () => <div>LeadsByClientTypeChart</div> }));
vi.mock("./CustomersGrowthChart", () => ({
  default: ({ dateRange }) => <div>CustomersGrowthChart:{JSON.stringify(dateRange)}</div>,
}));
vi.mock("./CustomersStatusSplitChart", () => ({ default: () => <div>CustomersStatusSplitChart</div> }));
vi.mock("./CustomersContractValueChart", () => ({ default: () => <div>CustomersContractValueChart</div> }));
vi.mock("./PaymentsTrendChart", () => ({
  default: ({ dateRange }) => <div>PaymentsTrendChart:{JSON.stringify(dateRange)}</div>,
}));
vi.mock("./AmcRenewalsUpcomingList", () => ({ default: () => <div>AmcRenewalsUpcomingList</div> }));
vi.mock("./AttendanceTrendChart", () => ({
  default: ({ dateRange }) => <div>AttendanceTrendChart:{JSON.stringify(dateRange)}</div>,
}));
vi.mock("./PayrollCostTrendChart", () => ({
  default: ({ dateRange }) => <div>PayrollCostTrendChart:{JSON.stringify(dateRange)}</div>,
}));
vi.mock("./ExportForm", () => ({ default: () => <div>ExportForm</div> }));

function setUser(user) {
  useSessionStore.setState({ user, isAuthenticated: true, isLoading: false });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ReportsPageContent — section permission-gating", () => {
  it("renders every section for an admin", () => {
    setUser({ _id: "admin-1", role: "admin", permissions: {} });

    render(<ReportsPageContent />);

    expect(screen.getByText("Leads")).toBeInTheDocument();
    expect(screen.getByText("Customers")).toBeInTheDocument();
    expect(screen.getByText("Financial")).toBeInTheDocument();
    expect(screen.getByText("Workforce")).toBeInTheDocument();
    expect(screen.getByText("LeadsPipelineChart")).toBeInTheDocument();
    expect(screen.getByText("CustomersGrowthChart", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("AmcRenewalsUpcomingList")).toBeInTheDocument();
    expect(screen.getByText("PayrollCostTrendChart", { exact: false })).toBeInTheDocument();
  });

  it("hides Leads/Customers/Financial/Workforce entirely for a role with no matching grants", () => {
    setUser({ _id: "employee-1", role: "employee", permissions: {} });

    render(<ReportsPageContent />);

    expect(screen.queryByText("Leads")).not.toBeInTheDocument();
    expect(screen.queryByText("Customers")).not.toBeInTheDocument();
    expect(screen.queryByText("Financial")).not.toBeInTheDocument();
    expect(screen.queryByText("Workforce")).not.toBeInTheDocument();
    // Export is always rendered (ExportForm decides its own empty state).
    expect(screen.getByText("ExportForm")).toBeInTheDocument();
  });

  it("shows only the AMC card (not Payments) within Financial for a sales_associate with amc.view but no payments.view", () => {
    setUser({
      _id: "sales-1",
      role: "sales_associate",
      permissions: { amc: { view: true } },
    });

    render(<ReportsPageContent />);

    expect(screen.getByText("Financial")).toBeInTheDocument();
    expect(screen.getByText("AmcRenewalsUpcomingList")).toBeInTheDocument();
    expect(screen.queryByText("PaymentsTrendChart", { exact: false })).not.toBeInTheDocument();
  });

  it("shows only the Attendance card (not Payroll) within Workforce for a manager with attendance.view_team only", () => {
    setUser({
      _id: "manager-1",
      role: "manager",
      permissions: { attendance: { view_team: true } },
    });

    render(<ReportsPageContent />);

    expect(screen.getByText("Workforce")).toBeInTheDocument();
    expect(screen.getByText("AttendanceTrendChart", { exact: false })).toBeInTheDocument();
    expect(screen.queryByText("PayrollCostTrendChart", { exact: false })).not.toBeInTheDocument();
  });
});

describe("ReportsPageContent — shared date-range filter", () => {
  it("passes the same computed range to every trend-based section, updating them together when the filter changes", async () => {
    setUser({ _id: "admin-1", role: "admin", permissions: {} });

    render(<ReportsPageContent />);

    const initialText = screen.getByText("LeadsConversionChart", { exact: false }).textContent;
    expect(initialText).toContain("from");

    await userEvent.click(screen.getByText("Last 3 Months"));

    const updatedLeads = screen.getByText("LeadsConversionChart", { exact: false }).textContent;
    const updatedCustomers = screen.getByText("CustomersGrowthChart", { exact: false }).textContent;
    const updatedPayments = screen.getByText("PaymentsTrendChart", { exact: false }).textContent;
    const updatedAttendance = screen.getByText("AttendanceTrendChart", { exact: false }).textContent;
    const updatedPayroll = screen.getByText("PayrollCostTrendChart", { exact: false }).textContent;

    // Every trend section reads from the same shared hook instance, so they
    // all carry the identical, newly-computed {from, to} after the switch.
    const rangeOf = (text) => text.split(":").slice(1).join(":");
    expect(rangeOf(updatedLeads)).toBe(rangeOf(updatedCustomers));
    expect(rangeOf(updatedLeads)).toBe(rangeOf(updatedPayments));
    expect(rangeOf(updatedLeads)).toBe(rangeOf(updatedAttendance));
    expect(rangeOf(updatedLeads)).toBe(rangeOf(updatedPayroll));
    expect(rangeOf(updatedLeads)).not.toBe(rangeOf(initialText));
  });
});
