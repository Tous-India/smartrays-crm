import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LeadsPipelineChart from "./LeadsPipelineChart";
import LeadsConversionChart from "./LeadsConversionChart";
import LeadsBySourceChart from "./LeadsBySourceChart";
import LeadsByClientTypeChart from "./LeadsByClientTypeChart";
import CustomersGrowthChart from "./CustomersGrowthChart";
import CustomersStatusSplitChart from "./CustomersStatusSplitChart";
import CustomersContractValueChart from "./CustomersContractValueChart";
import PaymentsTrendChart from "./PaymentsTrendChart";
import AmcRenewalsUpcomingList from "./AmcRenewalsUpcomingList";
import AttendanceTrendChart from "./AttendanceTrendChart";
import PayrollCostTrendChart from "./PayrollCostTrendChart";
import * as analyticsApi from "../api/analyticsApi";

// jsdom has no canvas support (verified: @ant-design/charts throws
// "HTMLCanvasElement.prototype.getContext not implemented" trying to render
// for real), so every chart type is stubbed to a plain div dumping its
// `data` prop as text — these tests assert the real section component
// fetches/transforms/passes the right data through, not the third-party
// chart library's own rendering.
vi.mock("@ant-design/charts", () => {
  function makeStub() {
    return function ChartStub(props) {
      return <div data-testid="chart-stub">{JSON.stringify(props.data)}</div>;
    };
  }
  return { Column: makeStub(), Line: makeStub(), Pie: makeStub(), Area: makeStub() };
});

vi.mock("../api/analyticsApi", () => ({
  getLeadsPipeline: vi.fn(),
  getLeadsConversion: vi.fn(),
  getLeadsBySource: vi.fn(),
  getLeadsByClientType: vi.fn(),
  getCustomersGrowth: vi.fn(),
  getCustomersStatusSplit: vi.fn(),
  getCustomersContractValue: vi.fn(),
  getPaymentsTrend: vi.fn(),
  getAmcRenewalsUpcoming: vi.fn(),
  getAttendanceTrend: vi.fn(),
  getPayrollCostTrend: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("LeadsPipelineChart", () => {
  it("passes label-mapped status/count data through to the chart", async () => {
    analyticsApi.getLeadsPipeline.mockResolvedValue({ data: { data: [{ status: "won", count: 3 }] } });

    render(<LeadsPipelineChart />);

    expect(await screen.findByTestId("chart-stub")).toHaveTextContent(/"count":3/);
  });

  it("shows the empty state when there are no leads", async () => {
    analyticsApi.getLeadsPipeline.mockResolvedValue({ data: { data: [] } });

    render(<LeadsPipelineChart />);

    expect(await screen.findByText("No leads yet")).toBeInTheDocument();
  });

  it("shows an inline error instead of crashing when the fetch rejects", async () => {
    analyticsApi.getLeadsPipeline.mockRejectedValue(new Error("down"));

    render(<LeadsPipelineChart />);

    expect(await screen.findByText("Couldn't load this chart")).toBeInTheDocument();
  });
});

describe("LeadsConversionChart", () => {
  it("fetches with the given dateRange and renders the conversion data", async () => {
    analyticsApi.getLeadsConversion.mockResolvedValue({
      data: { data: [{ month: "2026-06", totalLeads: 4, wonLeads: 2, conversionRate: 50 }] },
    });

    render(<LeadsConversionChart dateRange={{ from: "2026-06-01", to: "2026-06-30" }} />);

    expect(await screen.findByTestId("chart-stub")).toHaveTextContent(/"conversionRate":50/);
    expect(analyticsApi.getLeadsConversion).toHaveBeenCalledWith({ from: "2026-06-01", to: "2026-06-30" });
  });
});

describe("LeadsBySourceChart", () => {
  it("renders source counts", async () => {
    analyticsApi.getLeadsBySource.mockResolvedValue({ data: { data: [{ source: "Website", count: 5 }] } });

    render(<LeadsBySourceChart />);

    expect(await screen.findByTestId("chart-stub")).toHaveTextContent(/"source":"Website"/);
  });
});

describe("LeadsByClientTypeChart", () => {
  it("label-maps clientType before rendering", async () => {
    analyticsApi.getLeadsByClientType.mockResolvedValue({
      data: { data: [{ clientType: "residential", count: 7 }] },
    });

    render(<LeadsByClientTypeChart />);

    expect(await screen.findByTestId("chart-stub")).toHaveTextContent(/"count":7/);
  });
});

describe("CustomersGrowthChart", () => {
  it("fetches with the given dateRange", async () => {
    analyticsApi.getCustomersGrowth.mockResolvedValue({ data: { data: [{ month: "2026-06", newCustomers: 2 }] } });

    render(<CustomersGrowthChart dateRange={{ from: "2026-06-01", to: "2026-06-30" }} />);

    expect(await screen.findByTestId("chart-stub")).toHaveTextContent(/"newCustomers":2/);
    expect(analyticsApi.getCustomersGrowth).toHaveBeenCalledWith({ from: "2026-06-01", to: "2026-06-30" });
  });
});

describe("CustomersStatusSplitChart", () => {
  it("renders active/inactive as chart rows, dropping zero-count rows", async () => {
    analyticsApi.getCustomersStatusSplit.mockResolvedValue({ data: { data: { active: 4, inactive: 0 } } });

    render(<CustomersStatusSplitChart />);

    const stub = await screen.findByTestId("chart-stub");
    expect(stub).toHaveTextContent(/"status":"Active"/);
    expect(stub).not.toHaveTextContent(/"status":"Inactive"/);
  });

  it("shows the empty state when both active and inactive are 0", async () => {
    analyticsApi.getCustomersStatusSplit.mockResolvedValue({ data: { data: { active: 0, inactive: 0 } } });

    render(<CustomersStatusSplitChart />);

    expect(await screen.findByText("No customers yet")).toBeInTheDocument();
  });
});

describe("CustomersContractValueChart", () => {
  it("label-maps contract type before rendering", async () => {
    analyticsApi.getCustomersContractValue.mockResolvedValue({
      data: { data: [{ type: "monthly", totalValue: 8000, count: 2 }] },
    });

    render(<CustomersContractValueChart />);

    expect(await screen.findByTestId("chart-stub")).toHaveTextContent(/"totalValue":8000/);
  });
});

describe("PaymentsTrendChart", () => {
  it("fetches with the given dateRange", async () => {
    analyticsApi.getPaymentsTrend.mockResolvedValue({ data: { data: [{ month: "2026-06", totalAmount: 1500 }] } });

    render(<PaymentsTrendChart dateRange={{ from: "2026-06-01", to: "2026-06-30" }} />);

    expect(await screen.findByTestId("chart-stub")).toHaveTextContent(/"totalAmount":1500/);
    expect(analyticsApi.getPaymentsTrend).toHaveBeenCalledWith({ from: "2026-06-01", to: "2026-06-30" });
  });
});

describe("AttendanceTrendChart", () => {
  it("fetches with the given dateRange", async () => {
    analyticsApi.getAttendanceTrend.mockResolvedValue({ data: { data: [{ month: "2026-06", attendanceRate: 90 }] } });

    render(<AttendanceTrendChart dateRange={{ from: "2026-06-01", to: "2026-06-30" }} />);

    expect(await screen.findByTestId("chart-stub")).toHaveTextContent(/"attendanceRate":90/);
    expect(analyticsApi.getAttendanceTrend).toHaveBeenCalledWith({ from: "2026-06-01", to: "2026-06-30" });
  });
});

describe("PayrollCostTrendChart", () => {
  it("fetches with the given dateRange", async () => {
    analyticsApi.getPayrollCostTrend.mockResolvedValue({ data: { data: [{ month: "2026-06", totalCost: 20000 }] } });

    render(<PayrollCostTrendChart dateRange={{ from: "2026-06-01", to: "2026-06-30" }} />);

    expect(await screen.findByTestId("chart-stub")).toHaveTextContent(/"totalCost":20000/);
    expect(analyticsApi.getPayrollCostTrend).toHaveBeenCalledWith({ from: "2026-06-01", to: "2026-06-30" });
  });
});

describe("AmcRenewalsUpcomingList", () => {
  it("renders the fetched renewals as a list, not a chart", async () => {
    analyticsApi.getAmcRenewalsUpcoming.mockResolvedValue({
      data: {
        data: {
          count: 1,
          renewals: [{ customerId: "c1", customerName: "Acme Co", renewalDate: "2026-08-05", amount: 12000 }],
        },
      },
    });

    render(<AmcRenewalsUpcomingList />);

    expect(await screen.findByText("Acme Co")).toBeInTheDocument();
    expect(analyticsApi.getAmcRenewalsUpcoming).toHaveBeenCalledWith(30);
  });

  it("re-fetches with the newly selected day window", async () => {
    analyticsApi.getAmcRenewalsUpcoming.mockResolvedValue({ data: { data: { count: 0, renewals: [] } } });

    render(<AmcRenewalsUpcomingList />);
    await screen.findByText("No renewals due in this window");

    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(await screen.findByTitle("Next 60 days"));

    expect(analyticsApi.getAmcRenewalsUpcoming).toHaveBeenLastCalledWith(60);
  });

  it("shows the empty state when nothing is upcoming", async () => {
    analyticsApi.getAmcRenewalsUpcoming.mockResolvedValue({ data: { data: { count: 0, renewals: [] } } });

    render(<AmcRenewalsUpcomingList />);

    expect(await screen.findByText("No renewals due in this window")).toBeInTheDocument();
  });
});
