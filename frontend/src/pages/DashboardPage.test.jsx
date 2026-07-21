import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import DashboardPage from "./DashboardPage";
import useSessionStore from "../store/sessionStore";
import * as leadApi from "../modules/lead/api/leadApi";
import * as customerApi from "../modules/customer/api/customerApi";

vi.mock("../modules/lead/api/leadApi", () => ({
  listLeads: vi.fn(),
}));

vi.mock("../modules/customer/api/customerApi", () => ({
  listCustomers: vi.fn(),
  listContracts: vi.fn(),
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

describe("DashboardPage — role-based widget composition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    leadApi.listLeads.mockResolvedValue(EMPTY_LEADS);
    customerApi.listCustomers.mockResolvedValue(EMPTY_CUSTOMERS);
    customerApi.listContracts.mockResolvedValue({ data: { data: [] } });
  });

  it("renders every Leads + Customers widget for an admin", async () => {
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
  it("hides every widget for a manager whose permissions were overridden to grant nothing, even though manager's role config includes all 5", async () => {
    vi.clearAllMocks();
    leadApi.listLeads.mockResolvedValue(EMPTY_LEADS);
    customerApi.listCustomers.mockResolvedValue(EMPTY_CUSTOMERS);

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
    expect(leadApi.listLeads).not.toHaveBeenCalled();
    expect(customerApi.listCustomers).not.toHaveBeenCalled();
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
});
