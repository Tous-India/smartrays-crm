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
  listCredentials: vi.fn(),
  createCredential: vi.fn(),
  updateCredential: vi.fn(),
  deleteCredential: vi.fn(),
  revealCredential: vi.fn(),
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
    customerApi.listCredentials.mockResolvedValue({
      data: { data: [{ _id: "cred-1", service: "Hosting", username: "admin" }] },
    });
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
    expect(screen.getByText("Hosting")).toBeInTheDocument(); // credential service
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

  it("keeps the credential password masked until Reveal is confirmed", async () => {
    customerApi.revealCredential.mockResolvedValue({ data: { data: { password: "s3cr3t!" } } });
    renderDetailPage();
    await screen.findByText("Hosting");

    expect(screen.getByText("••••••••")).toBeInTheDocument();
    expect(screen.queryByText("s3cr3t!")).not.toBeInTheDocument();
  });

  it("does not call the reveal endpoint until the confirm step completes", async () => {
    customerApi.revealCredential.mockResolvedValue({ data: { data: { password: "s3cr3t!" } } });
    renderDetailPage();
    await screen.findByText("Hosting");

    // Clicking the link only opens the confirm popover — the endpoint must
    // not be called until the popover's own "Reveal" confirm button fires.
    await userEvent.click(screen.getByRole("button", { name: "Reveal" }));
    expect(customerApi.revealCredential).not.toHaveBeenCalled();

    const confirmButton = await screen.findAllByRole("button", { name: "Reveal" });
    await userEvent.click(confirmButton[confirmButton.length - 1]);

    await waitFor(() => {
      expect(customerApi.revealCredential).toHaveBeenCalledWith("cust-1", "cred-1");
    });

    expect(await screen.findByText("s3cr3t!")).toBeInTheDocument();
  });
});

describe("CustomerDetailPage — permission gating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    customerApi.getCustomer.mockResolvedValue({ data: { data: SAMPLE_CUSTOMER } });
    customerApi.listContacts.mockResolvedValue({ data: { data: [] } });
    customerApi.listContracts.mockResolvedValue({ data: { data: [] } });
    customerApi.listCredentials.mockResolvedValue({
      data: { data: [{ _id: "cred-1", service: "Hosting", username: "admin" }] },
    });
    customerApi.listActivity.mockResolvedValue({ data: { data: [] } });
  });

  it("hides the Credentials Vault section for a role with no credentials.view grant", async () => {
    useSessionStore.setState({
      user: {
        _id: "employee-1",
        role: "employee",
        permissions: { customers: { view: true, edit: true } },
      },
      isAuthenticated: true,
      isLoading: false,
    });

    renderDetailPage();
    await screen.findByText("Acme Corp");

    expect(screen.queryByText("Credentials Vault")).not.toBeInTheDocument();
    expect(screen.queryByText("Hosting")).not.toBeInTheDocument();
  });

  it("shows the Credentials Vault section for a role with credentials.view", async () => {
    useSessionStore.setState({
      user: {
        _id: "admin-1",
        role: "admin",
        permissions: {},
      },
      isAuthenticated: true,
      isLoading: false,
    });

    renderDetailPage();
    await screen.findByText("Acme Corp");

    expect(screen.getByText("Credentials Vault")).toBeInTheDocument();
    expect(screen.getByText("Hosting")).toBeInTheDocument();
  });
});
