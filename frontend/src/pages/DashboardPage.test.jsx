import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import DashboardPage from "./DashboardPage";
import useSessionStore from "../store/sessionStore";
import * as leadApi from "../modules/lead/api/leadApi";
import * as customerApi from "../modules/customer/api/customerApi";
import * as attendanceApi from "../modules/attendance/api/attendanceApi";
import * as leaveApi from "../modules/leave/api/leaveApi";
import * as complaintApi from "../modules/complaint/api/complaintApi";
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

// The "Customer complaints" widget reads the complaints list (2026-10-23).
vi.mock("../modules/complaint/api/complaintApi", () => ({
  listComplaints: vi.fn(),
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

// Services (§7.72) — the two dashboard widgets fetch through this.
vi.mock("../modules/service/api/serviceApi", () => ({
  listServices: vi.fn().mockResolvedValue({ data: { data: [] } }),
  changeServiceStatus: vi.fn(),
  toggleSubtask: vi.fn(),
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
  complaintApi.listComplaints.mockResolvedValue({ data: { data: [] } });
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
    expect(screen.getByText("Customer complaints")).toBeInTheDocument();
    expect(screen.getByText("AMC Renewals Due")).toBeInTheDocument();
    expect(screen.getByText("Payments This Month")).toBeInTheDocument();
    expect(screen.getByText("Payroll Status (This Month)")).toBeInTheDocument();
  });

  it("renders manager's narrower operational widget set (Attendance/AMC, not Leave/Payments/Payroll/Complaints)", async () => {
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
    // Complaints follow complaints.* since 2026-10-23 — the old tickets grant no longer shows them.
    expect(screen.queryByText("Customer complaints")).not.toBeInTheDocument();
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
    expect(screen.queryByText("Customer complaints")).not.toBeInTheDocument();
  });

  it("shows the 'no widgets' message for a role with an empty candidate list (customer)", () => {
    // Employee stopped being the empty-list example in §7.72 — it now has
    // MyServicesWidget as a candidate. Customer never renders this page in
    // practice (PortalLayout), but it is the one role whose list is still [].
    useSessionStore.setState({
      user: { _id: "customer-1", role: "customer", permissions: {} },
      isAuthenticated: true,
      isLoading: false,
    });

    renderPage();

    expect(screen.getByText("No dashboard widgets are available for your role yet.")).toBeInTheDocument();
    expect(screen.queryByText("Leads Pipeline")).not.toBeInTheDocument();
  });
});

describe("DashboardPage — permission-gating overrides role defaults", () => {
  it("renders My Services for an employee holding services.view, and nothing at all for one without (§7.72)", async () => {
    useSessionStore.setState({
      user: { _id: "employee-1", role: "employee", permissions: { services: { view: true } } },
      isAuthenticated: true,
      isLoading: false,
    });
    const { unmount } = renderPage();

    expect(await screen.findByText(/My Services/)).toBeInTheDocument();
    unmount();

    // No grant: the candidate renders null. The candidate list is non-empty,
    // so the old `widgets.length === 0` check would not fire — the page now
    // measures what the grid painted and falls back to the same message
    // rather than a blank page (§7.72). Not an error state.
    useSessionStore.setState({
      user: { _id: "employee-2", role: "employee", permissions: {} },
      isAuthenticated: true,
      isLoading: false,
    });
    renderPage();

    expect(screen.queryByText(/My Services/)).not.toBeInTheDocument();
    expect(screen.queryByText("Couldn't load this widget")).not.toBeInTheDocument();
    expect(screen.getByText("No dashboard widgets are available for your role yet.")).toBeInTheDocument();
  });

  it("falls back to the message for ANY role whose whole candidate set renders nothing — not a Services special case", () => {
    // A manager with every grant overridden away: 9 candidates, all null.
    useSessionStore.setState({
      user: { _id: "manager-2", role: "manager", permissions: {} },
      isAuthenticated: true,
      isLoading: false,
    });
    renderPage();

    expect(screen.getByText("No dashboard widgets are available for your role yet.")).toBeInTheDocument();
    expect(screen.queryByText("Leads Pipeline")).not.toBeInTheDocument();
  });

  it("shows NO message once any candidate paints — the message and the grid are never both meaningful", async () => {
    useSessionStore.setState({
      user: { _id: "employee-3", role: "employee", permissions: { services: { view: true } } },
      isAuthenticated: true,
      isLoading: false,
    });
    renderPage();

    expect(await screen.findByText(/My Services/)).toBeInTheDocument();
    expect(screen.queryByText("No dashboard widgets are available for your role yet.")).not.toBeInTheDocument();
  });

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

    // Each widget itself renders nothing. The candidate list is non-empty,
    // so until §7.72 this was a blank page; the page now measures the grid
    // and shows the same "no widgets" message (asserted in the test below).
    await screen.findByRole("heading", { name: "Dashboard" });
    expect(screen.queryByText("Leads Pipeline")).not.toBeInTheDocument();
    expect(screen.queryByText("Follow-ups Due")).not.toBeInTheDocument();
    expect(screen.queryByText("Hot Leads")).not.toBeInTheDocument();
    expect(screen.queryByText("Customers Overview")).not.toBeInTheDocument();
    expect(screen.queryByText("Recently Added Customers")).not.toBeInTheDocument();
    expect(screen.queryByText("Present Today")).not.toBeInTheDocument();
    expect(screen.queryByText("Customer complaints")).not.toBeInTheDocument();
    expect(screen.queryByText("AMC Renewals Due")).not.toBeInTheDocument();
    expect(leadApi.listLeads).not.toHaveBeenCalled();
    expect(customerApi.listCustomers).not.toHaveBeenCalled();
    expect(attendanceApi.getTeamAttendance).not.toHaveBeenCalled();
    expect(complaintApi.listComplaints).not.toHaveBeenCalled();
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

  it("shows an inline error on the failing Complaints widget while the AMC widget on the same page still renders real data", async () => {
    vi.clearAllMocks();
    leadApi.listLeads.mockResolvedValue(EMPTY_LEADS);
    customerApi.listCustomers.mockResolvedValue(EMPTY_CUSTOMERS);
    customerApi.listContracts.mockResolvedValue({ data: { data: [] } });
    attendanceApi.getTeamAttendance.mockResolvedValue({ data: { data: [] } });
    leaveApi.listLeave.mockResolvedValue({ data: { data: [] } });
    complaintApi.listComplaints.mockRejectedValue(new Error("tickets API down"));
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
