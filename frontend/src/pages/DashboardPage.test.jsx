import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import DashboardPage from "./DashboardPage";
import useSessionStore from "../store/sessionStore";
import * as leadApi from "../modules/lead/api/leadApi";
import * as customerApi from "../modules/customer/api/customerApi";
import * as attendanceApi from "../modules/attendance/api/attendanceApi";
import * as leaveApi from "../modules/leave/api/leaveApi";
import * as ticketApi from "../modules/ticket/api/ticketApi";
import * as amcApi from "../modules/amc/api/amcApi";
import * as paymentApi from "../modules/payment/api/paymentApi";
import * as payrollApi from "../modules/payroll/api/payrollApi";
import * as userDirectoryApi from "../services/userDirectoryApi";

vi.mock("../modules/lead/api/leadApi", () => ({
  listLeads: vi.fn(),
}));

vi.mock("../modules/customer/api/customerApi", () => ({
  listCustomers: vi.fn(),
  listContracts: vi.fn(),
}));

vi.mock("../modules/attendance/api/attendanceApi", () => ({
  getTeamAttendance: vi.fn(),
}));

vi.mock("../modules/leave/api/leaveApi", () => ({
  listLeave: vi.fn(),
}));

vi.mock("../modules/ticket/api/ticketApi", () => ({
  listTickets: vi.fn(),
}));

vi.mock("../modules/amc/api/amcApi", () => ({
  listAmc: vi.fn(),
}));

vi.mock("../modules/payment/api/paymentApi", () => ({
  listPayments: vi.fn(),
}));

vi.mock("../modules/payroll/api/payrollApi", () => ({
  listPayroll: vi.fn(),
}));

vi.mock("../services/userDirectoryApi", () => ({
  fetchUserDropdown: vi.fn(),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>
  );
}

const EMPTY_LEADS = { data: { data: [] } };
const EMPTY_CUSTOMERS = { data: { data: [] } };

// Shared "nothing to report" defaults for the 6 operational widgets, applied
// across every describe block below — each test only overrides what it's
// specifically asserting on, matching the Leads/Customers mocks' own style.
function mockOperationalWidgetsEmpty() {
  attendanceApi.getTeamAttendance.mockResolvedValue({ data: { data: [] } });
  leaveApi.listLeave.mockResolvedValue({ data: { data: [] } });
  ticketApi.listTickets.mockResolvedValue({ data: { data: [] } });
  amcApi.listAmc.mockResolvedValue({ data: { data: [] } });
  paymentApi.listPayments.mockResolvedValue({ data: { data: [] } });
  payrollApi.listPayroll.mockResolvedValue({ data: { data: [] } });
  userDirectoryApi.fetchUserDropdown.mockResolvedValue({ data: { data: [] } });
}

describe("DashboardPage — role-based widget composition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    leadApi.listLeads.mockResolvedValue(EMPTY_LEADS);
    customerApi.listCustomers.mockResolvedValue(EMPTY_CUSTOMERS);
    customerApi.listContracts.mockResolvedValue({ data: { data: [] } });
    mockOperationalWidgetsEmpty();
  });

  it("renders every Leads + Customers + operational widget for an admin", async () => {
    useSessionStore.setState({
      user: { _id: "admin-1", role: "admin", permissions: {} },
      isAuthenticated: true,
      isLoading: false,
    });

    renderPage();

    expect(await screen.findByText("Leads Pipeline")).toBeInTheDocument();
    expect(screen.getByText("Follow-ups Due")).toBeInTheDocument();
    expect(screen.getByText("Hot Leads")).toBeInTheDocument();
    expect(screen.getByText("Customers Overview")).toBeInTheDocument();
    expect(screen.getByText("Recently Added Customers")).toBeInTheDocument();
    expect(screen.getByText("Present Today")).toBeInTheDocument();
    expect(screen.getByText("Pending Leave Requests")).toBeInTheDocument();
    expect(screen.getByText("Open Tickets")).toBeInTheDocument();
    expect(screen.getByText("AMC Renewals Due")).toBeInTheDocument();
    expect(screen.getByText("Payments This Month")).toBeInTheDocument();
    expect(screen.getByText("Payroll Status (This Month)")).toBeInTheDocument();
  });

  it("renders manager's narrower operational widget set (Attendance/Tickets/AMC, not Leave/Payments/Payroll)", async () => {
    useSessionStore.setState({
      user: {
        _id: "manager-1",
        role: "manager",
        permissions: {
          attendance: { view_team: true },
          tickets: { view_all: true },
          amc: { view: true },
        },
      },
      isAuthenticated: true,
      isLoading: false,
    });

    renderPage();

    expect(await screen.findByText("Present Today")).toBeInTheDocument();
    expect(screen.getByText("Open Tickets")).toBeInTheDocument();
    expect(screen.getByText("AMC Renewals Due")).toBeInTheDocument();
    expect(screen.queryByText("Pending Leave Requests")).not.toBeInTheDocument();
    expect(screen.queryByText("Payments This Month")).not.toBeInTheDocument();
    expect(screen.queryByText("Payroll Status (This Month)")).not.toBeInTheDocument();
  });

  it("renders only the Leads widgets candidate set for a sales_associate whose permissions grant leads but not customers", async () => {
    useSessionStore.setState({
      user: {
        _id: "sales-1",
        role: "sales_associate",
        permissions: { leads: { view: true }, customers: { view: false } },
      },
      isAuthenticated: true,
      isLoading: false,
    });

    renderPage();

    expect(await screen.findByText("Leads Pipeline")).toBeInTheDocument();
    expect(screen.queryByText("Customers Overview")).not.toBeInTheDocument();
    expect(screen.queryByText("Recently Added Customers")).not.toBeInTheDocument();
    expect(screen.queryByText("Open Tickets")).not.toBeInTheDocument();
  });

  it("shows the 'no widgets' message for a role with an empty candidate list (employee)", () => {
    useSessionStore.setState({
      user: { _id: "employee-1", role: "employee", permissions: {} },
      isAuthenticated: true,
      isLoading: false,
    });

    renderPage();

    expect(screen.getByText("No dashboard widgets are available for your role yet.")).toBeInTheDocument();
    expect(screen.queryByText("Leads Pipeline")).not.toBeInTheDocument();
  });
});

describe("DashboardPage — permission-gating overrides role defaults", () => {
  it("hides every widget for a manager whose permissions were overridden to grant nothing, even though manager's role config includes 8 widgets", async () => {
    vi.clearAllMocks();
    leadApi.listLeads.mockResolvedValue(EMPTY_LEADS);
    customerApi.listCustomers.mockResolvedValue(EMPTY_CUSTOMERS);
    mockOperationalWidgetsEmpty();

    useSessionStore.setState({
      user: { _id: "manager-1", role: "manager", permissions: {} }, // no grants at all
      isAuthenticated: true,
      isLoading: false,
    });

    renderPage();

    // The role-level candidate list is non-empty, so this isn't the "no
    // widgets for this role" message — each widget itself renders nothing.
    await screen.findByRole("heading", { name: "Dashboard" });
    expect(screen.queryByText("Leads Pipeline")).not.toBeInTheDocument();
    expect(screen.queryByText("Follow-ups Due")).not.toBeInTheDocument();
    expect(screen.queryByText("Hot Leads")).not.toBeInTheDocument();
    expect(screen.queryByText("Customers Overview")).not.toBeInTheDocument();
    expect(screen.queryByText("Recently Added Customers")).not.toBeInTheDocument();
    expect(screen.queryByText("Present Today")).not.toBeInTheDocument();
    expect(screen.queryByText("Open Tickets")).not.toBeInTheDocument();
    expect(screen.queryByText("AMC Renewals Due")).not.toBeInTheDocument();
    expect(leadApi.listLeads).not.toHaveBeenCalled();
    expect(customerApi.listCustomers).not.toHaveBeenCalled();
    expect(attendanceApi.getTeamAttendance).not.toHaveBeenCalled();
    expect(ticketApi.listTickets).not.toHaveBeenCalled();
    expect(amcApi.listAmc).not.toHaveBeenCalled();
  });
});

describe("DashboardPage — one widget failing doesn't break the others", () => {
  it("shows an inline error on the failing Leads widgets while Customers widgets still render real data", async () => {
    vi.clearAllMocks();
    leadApi.listLeads.mockRejectedValue(new Error("leads API down"));
    customerApi.listCustomers.mockResolvedValue({
      data: { data: [{ _id: "c1", companyName: "Still Works Co" }] },
    });
    customerApi.listContracts.mockResolvedValue({ data: { data: [] } });
    mockOperationalWidgetsEmpty();

    useSessionStore.setState({
      user: { _id: "admin-1", role: "admin", permissions: {} },
      isAuthenticated: true,
      isLoading: false,
    });

    renderPage();

    // Leads widgets each show their own inline error, not a thrown exception.
    const errorAlerts = await screen.findAllByText("Couldn't load this widget");
    expect(errorAlerts.length).toBeGreaterThan(0);

    // Customers widgets, on the same page, are entirely unaffected.
    expect(await screen.findByText("Still Works Co")).toBeInTheDocument();
    expect(screen.getByText("Customers Overview")).toBeInTheDocument();
  });

  it("shows an inline error on the failing Tickets widget while the AMC widget on the same page still renders real data", async () => {
    vi.clearAllMocks();
    leadApi.listLeads.mockResolvedValue(EMPTY_LEADS);
    customerApi.listCustomers.mockResolvedValue(EMPTY_CUSTOMERS);
    customerApi.listContracts.mockResolvedValue({ data: { data: [] } });
    attendanceApi.getTeamAttendance.mockResolvedValue({ data: { data: [] } });
    leaveApi.listLeave.mockResolvedValue({ data: { data: [] } });
    ticketApi.listTickets.mockRejectedValue(new Error("tickets API down"));
    amcApi.listAmc.mockResolvedValue({
      data: { data: [{ _id: "amc1", renewalDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString() }] },
    });
    paymentApi.listPayments.mockResolvedValue({ data: { data: [] } });
    payrollApi.listPayroll.mockResolvedValue({ data: { data: [] } });

    useSessionStore.setState({
      user: { _id: "admin-1", role: "admin", permissions: {} },
      isAuthenticated: true,
      isLoading: false,
    });

    renderPage();

    const errorAlerts = await screen.findAllByText("Couldn't load this widget");
    expect(errorAlerts.length).toBeGreaterThan(0);

    expect(await screen.findByText("AMC Renewals Due")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });
});
