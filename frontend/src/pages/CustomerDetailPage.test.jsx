import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import CustomerDetailPage from "./CustomerDetailPage";
import useSessionStore from "../store/sessionStore";
import * as customerApi from "../modules/customer/api/customerApi";

vi.mock("../modules/customer/api/customerApi", () => ({
  getCustomer: vi.fn(),
  updateCustomer: vi.fn(),
  deleteCustomer: vi.fn(),
  listContacts: vi.fn(),
  createContact: vi.fn(),
  updateContact: vi.fn(),
  deleteContact: vi.fn(),
  listContracts: vi.fn(),
  createContract: vi.fn(),
  updateContract: vi.fn(),
  deleteContract: vi.fn(),
  listActivity: vi.fn(),
}));

vi.mock("../services/userDirectoryApi", () => ({
  fetchUserDropdown: vi.fn().mockResolvedValue({
    data: { data: [{ _id: "user-1", name: "Priya PM", role: "manager" }] },
  }),
}));

const SAMPLE_CUSTOMER = {
  _id: "cust-1",
  companyName: "Acme Corp",
  email: "hello@acme.com",
  phone: "555-0100",
  ownerId: "user-1",
  projectManagerId: "user-1",
  source: "Referral",
  signedUpAt: "2026-01-01T00:00:00.000Z",
  customerStatus: "active",
  billingType: "registered",
  billingName: "Acme Corp Pvt Ltd",
  gstin: "07AAAAA0000A1Z5",
  billingAddress: "123 Main St",
};

const SAMPLE_CONTRACT = {
  _id: "contract-1",
  type: "monthly",
  amount: 5000,
  label: "Website Retainer",
  renewalDate: null,
};

function renderDetailPage() {
  return render(
    <MemoryRouter initialEntries={["/customers/cust-1"]}>
      <Routes>
        <Route path="/customers/:id" element={<CustomerDetailPage />} />
        <Route path="/customers" element={<div>Customers List</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("CustomerDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    customerApi.getCustomer.mockResolvedValue({ data: { data: SAMPLE_CUSTOMER } });
    customerApi.listContacts.mockResolvedValue({ data: { data: [] } });
    customerApi.listContracts.mockResolvedValue({ data: { data: [SAMPLE_CONTRACT] } });
    customerApi.listActivity.mockResolvedValue({
      data: { data: [{ _id: "act-1", action: "created", createdAt: "2026-01-01T00:00:00.000Z" }] },
    });
    useSessionStore.setState({
      user: { _id: "admin-1", role: "admin", permissions: {} },
      isAuthenticated: true,
      isLoading: false,
    });
  });

  it("renders every section with real data", async () => {
    renderDetailPage();

    expect(await screen.findByText("Acme Corp")).toBeInTheDocument();
    expect(screen.getByText(/hello@acme.com/)).toBeInTheDocument();
    expect(screen.getByText("Acme Corp Pvt Ltd")).toBeInTheDocument(); // billing name
    expect(screen.getByText("Website Retainer")).toBeInTheDocument(); // contract
    expect(screen.getByText("Invoice History")).toBeInTheDocument();
    expect(screen.getByText(/real invoicing.*isn't built yet/)).toBeInTheDocument();
  });

  it("removing a contract shows the completes-project warning and calls the delete endpoint", async () => {
    customerApi.deleteContract.mockResolvedValue({});
    renderDetailPage();
    await screen.findByText("Website Retainer");

    const contractItem = screen.getByText("Website Retainer").closest("li");
    const [, deleteButton] = within(contractItem).getAllByRole("button");
    await userEvent.click(deleteButton);

    expect(
      await screen.findByText(/completes its linked project and cancels its linked invoice/)
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() => {
      expect(customerApi.deleteContract).toHaveBeenCalledWith("cust-1", "contract-1");
    });
  });
});
