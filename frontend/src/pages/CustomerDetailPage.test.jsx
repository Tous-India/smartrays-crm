import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import CustomerDetailPage from "./CustomerDetailPage";
import useSessionStore from "../store/sessionStore";
import * as customerApi from "../modules/customer/api/customerApi";
import * as paymentApi from "../modules/payment/api/paymentApi";

vi.mock("antd", async (importOriginal) => {
  const actual = await importOriginal();
  // Components read `message` via `App.useApp()` (§7.28 message-rendering
  // fix — the static import silently fails to render under React 19), not
  // the static export, so the mock has to intercept the hook too.
  const mockMessage = { success: vi.fn(), error: vi.fn() };
  actual.App.useApp = () => ({ message: mockMessage });
  return { ...actual, message: mockMessage };
});

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
  // §7.70 — the page's own Payments section.
  listCustomerPayments: vi.fn(),
}));

vi.mock("../modules/payment/api/paymentApi", () => ({
  createPayment: vi.fn(),
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
    customerApi.listCustomerPayments.mockResolvedValue({ data: { data: { items: [], total: 0, page: 1, limit: null } } });
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
  });

  it("no longer renders an Invoice History section — invoicing is descoped (2026-08-05)", async () => {
    renderDetailPage();

    await screen.findByText("Acme Corp");

    expect(screen.queryByText("Invoice History")).not.toBeInTheDocument();
    expect(screen.queryByText(/real invoicing.*isn't built yet/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Create Invoice/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /View Ledger/ })).not.toBeInTheDocument();
  });

  it("shows AMC first, then Site & Installation Details, then Billing (2026-08-05)", async () => {
    renderDetailPage();

    await screen.findByText("Acme Corp");

    const headings = screen.getAllByText(/^(AMC|Site & Installation Details|Billing Details)$/);
    expect(headings.map((node) => node.textContent)).toEqual([
      "AMC",
      "Site & Installation Details",
      "Billing Details",
    ]);
  });

  it("shows Site & Installation Details above Billing Details (2026-08-05)", async () => {
    renderDetailPage();

    await screen.findByText("Acme Corp");

    const headings = screen.getAllByText(/Site & Installation Details|Billing Details/);
    expect(headings[0]).toHaveTextContent("Site & Installation Details");
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

  it("deactivating an active customer shows the completes-project warning before calling updateCustomer", async () => {
    customerApi.updateCustomer.mockResolvedValue({ data: { data: { ...SAMPLE_CUSTOMER, customerStatus: "inactive" } } });
    renderDetailPage();
    await screen.findByText("Acme Corp");

    // The trigger button's accessible name includes its icon ("stop
    // Deactivate"), hence the regex rather than an exact string match.
    await userEvent.click(screen.getByRole("button", { name: /Deactivate/ }));

    expect(
      await screen.findByText(/completes every active project for this customer/)
    ).toBeInTheDocument();

    // Confirming re-uses the exact same single-customer PATCH endpoint Edit
    // already calls — not the bulk endpoint.
    expect(customerApi.updateCustomer).not.toHaveBeenCalled();

    // Two "Deactivate" matches once the Popconfirm is open (the trigger
    // button behind it, plus its own confirm button) — the confirm button
    // is the last one, same pattern this file previously used for the
    // (now-removed) credential reveal confirm.
    const confirmButtons = await screen.findAllByRole("button", { name: /Deactivate/ });
    await userEvent.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => {
      expect(customerApi.updateCustomer).toHaveBeenCalledWith("cust-1", { customerStatus: "inactive" });
    });
  });

  it("shows Activate (no warning) for an already-inactive customer, toggling back to active", async () => {
    customerApi.getCustomer.mockResolvedValue({
      data: { data: { ...SAMPLE_CUSTOMER, customerStatus: "inactive" } },
    });
    customerApi.updateCustomer.mockResolvedValue({ data: { data: { ...SAMPLE_CUSTOMER, customerStatus: "active" } } });
    renderDetailPage();
    await screen.findByText("Acme Corp");

    expect(screen.queryByRole("button", { name: /Deactivate/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Activate/ }));

    await waitFor(() => {
      expect(customerApi.updateCustomer).toHaveBeenCalledWith("cust-1", { customerStatus: "active" });
    });
  });
});

/**
 * §7.70 — the customer page's own Payments section and its Record Payment
 * entry point. Same record, second door: what it posts must be identical to
 * what the Payments page posts, with the customer taken from the page.
 */
describe("CustomerDetailPage — Payments section (§7.70)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    customerApi.getCustomer.mockResolvedValue({ data: { data: SAMPLE_CUSTOMER } });
    customerApi.listContracts.mockResolvedValue({ data: { data: [SAMPLE_CONTRACT] } });
    customerApi.listActivity.mockResolvedValue({ data: { data: [] } });
    customerApi.listContacts.mockResolvedValue({
      data: { data: [{ _id: "contact-1", name: "Ramesh Kumar", isPrimary: true }] },
    });
    customerApi.listCustomerPayments.mockResolvedValue({
      data: {
        data: {
          items: [
            {
              _id: "pay-1",
              customerId: SAMPLE_CUSTOMER._id,
              contactId: "contact-gone",
              contactName: "Departed Dinesh",
              date: "2026-09-10T09:30:00.000Z",
              amount: 12000,
              notes: "Cash at site",
              recordedBy: "user-1",
              collectedBy: "user-1",
            },
          ],
          total: 1,
          page: 1,
          limit: null,
        },
      },
    });
    paymentApi.createPayment.mockResolvedValue({ data: { data: { _id: "new-payment" } } });
    useSessionStore.setState({
      user: { _id: "user-1", name: "Priya PM", role: "admin", permissions: {} },
      isAuthenticated: true,
      isLoading: false,
    });
  });

  it("lists this customer's payments with Date, Contact, Amount, Notes, Collected By", async () => {
    renderDetailPage();

    const section = await screen.findByTestId("customer-payments-section");
    await within(section).findByText("₹12,000");

    ["Date", "Contact", "Amount", "Notes", "Collected By"].forEach((header) => {
      expect(within(section).getByRole("columnheader", { name: header })).toBeInTheDocument();
    });
    expect(within(section).queryByRole("columnheader", { name: "Customer" })).not.toBeInTheDocument();
    expect(within(section).getByText("Cash at site")).toBeInTheDocument();
    expect(within(section).getByText("Priya PM")).toBeInTheDocument();
    expect(customerApi.listCustomerPayments).toHaveBeenCalledWith(SAMPLE_CUSTOMER._id);
  });

  it("renders the snapshot name when the contact no longer exists", async () => {
    // "contact-gone" is not in the loaded contacts — the ref is dangling,
    // exactly what a hard-deleted contact leaves behind.
    renderDetailPage();

    const section = await screen.findByTestId("customer-payments-section");
    expect(await within(section).findByText("Departed Dinesh")).toBeInTheDocument();
  });

  it("records from this page with the customer FIXED — a label, not the search picker", async () => {
    renderDetailPage();

    const section = await screen.findByTestId("customer-payments-section");
    await within(section).findByText("₹12,000");
    await userEvent.click(within(section).getByRole("button", { name: /Record Payment/ }));

    // The customer is shown as text. No search Select is rendered for it, so
    // there is no option list for a pre-set id to fail to match.
    const fixed = await screen.findByTestId("fixed-customer");
    expect(fixed).toHaveTextContent("Acme Corp");
    expect(screen.queryByPlaceholderText(/Search customer/)).not.toBeInTheDocument();

    // Contact options come from the page's already-loaded contacts.
    await userEvent.click(screen.getByLabelText("Contact"));
    await userEvent.click(await screen.findByTitle("Ramesh Kumar"));

    // Collected By defaulted to the recording user, by name.
    await waitFor(() => {
      expect(screen.getByLabelText("Collected By").closest(".ant-select")).toHaveTextContent("Priya PM");
    });

    await userEvent.type(screen.getByLabelText("Amount"), "5000");
    const listCallsBeforeSave = customerApi.listCustomerPayments.mock.calls.length;
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(paymentApi.createPayment).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: SAMPLE_CUSTOMER._id,
          contactId: "contact-1",
          amount: 5000,
          collectedBy: "user-1",
        })
      );
    });
    // The section refreshes its own list after the save.
    await waitFor(() =>
      expect(customerApi.listCustomerPayments.mock.calls.length).toBeGreaterThan(listCallsBeforeSave)
    );
  });

  it("hides Record Payment from a viewer without payments.create, but still shows the list", async () => {
    useSessionStore.setState({
      user: { _id: "sales-1", role: "sales_associate", permissions: { customers: { view: true } } },
      isAuthenticated: true,
      isLoading: false,
    });

    renderDetailPage();

    const section = await screen.findByTestId("customer-payments-section");
    await within(section).findByText("₹12,000");
    expect(within(section).queryByRole("button", { name: /Record Payment/ })).not.toBeInTheDocument();
  });
});
