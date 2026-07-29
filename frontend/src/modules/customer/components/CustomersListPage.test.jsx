import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { message } from "antd";
import { MemoryRouter } from "react-router-dom";
import CustomersListPage from "./CustomersListPage";
import useSessionStore from "../../../store/sessionStore";
import * as customerApi from "../api/customerApi";

// AntD's `message` is a global static toast portal-rendered outside the
// React tree RTL controls — asserting on its rendered DOM text is
// unreliable under jsdom (no other test in this codebase does it). Mocking
// the function directly and asserting on the call is what the app actually
// guarantees: that the right feedback string was requested.
vi.mock("antd", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, message: { success: vi.fn(), error: vi.fn() } };
});

vi.mock("../api/customerApi", () => ({
  listCustomers: vi.fn(),
  getCustomer: vi.fn(),
  createCustomer: vi.fn(),
  updateCustomer: vi.fn(),
  deleteCustomer: vi.fn(),
  bulkUpdateCustomers: vi.fn(),
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

vi.mock("../../../services/userDirectoryApi", () => ({
  fetchUserDropdown: vi.fn(),
}));

const { fetchUserDropdown } = await import("../../../services/userDirectoryApi");

const SAMPLE_CUSTOMERS = [
  {
    _id: "cust-1",
    companyName: "Acme Corp",
    ownerId: "user-1",
    source: "Referral",
    signedUpAt: "2026-01-01T00:00:00.000Z",
    customerStatus: "active",
    primaryContact: { name: "Jane Primary", phone: "9998887777" },
  },
  {
    _id: "cust-2",
    companyName: "Beta Co",
    ownerId: "user-1",
    source: "Website",
    signedUpAt: "2026-02-01T00:00:00.000Z",
    customerStatus: "active",
    primaryContact: null,
  },
];

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/customers"]}>
      <CustomersListPage />
    </MemoryRouter>
  );
}

describe("CustomersListPage — List View", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    customerApi.listCustomers.mockResolvedValue({ data: { data: SAMPLE_CUSTOMERS } });
    customerApi.listContracts.mockResolvedValue({ data: { data: [] } });
    fetchUserDropdown.mockResolvedValue({
      data: { data: [{ _id: "user-1", name: "Priya PM", role: "manager" }] },
    });
    useSessionStore.setState({
      user: { _id: "admin-1", role: "admin", permissions: {} },
      isAuthenticated: true,
      isLoading: false,
    });
  });

  it("renders the fetched customers, defaulting to active-only", async () => {
    renderPage();

    expect(await screen.findByText("Acme Corp")).toBeInTheDocument();
    expect(screen.getByText("Beta Co")).toBeInTheDocument();
    expect(customerApi.listCustomers).toHaveBeenCalledWith(
      expect.objectContaining({ status: "active" })
    );
  });

  it("shows each customer's primary contact (name + copyable phone), and '—' when there is none", async () => {
    // jsdom has no `navigator.clipboard` at all — stubbed here the same way
    // this codebase mocks every other browser API jsdom lacks (getUserMedia,
    // the Google Maps SDK, etc.), since this is the first test anywhere to
    // actually exercise the copy button's click handler rather than just its
    // rendering.
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    renderPage();
    await screen.findByText("Acme Corp");

    expect(screen.getByText("Jane Primary")).toBeInTheDocument();
    expect(screen.getByText("9998887777")).toBeInTheDocument();

    const betaRow = screen.getByText("Beta Co").closest("tr");
    const betaCells = within(betaRow).getAllByRole("cell");
    // cells[0] is the row-selection checkbox cell; column order after that is
    // Company Name, Contact, Owner, Type, Source, Signed Up, Status.
    expect(betaCells[2]).toHaveTextContent("—");

    await userEvent.click(screen.getByRole("button", { name: /copy/i }));

    expect(writeText).toHaveBeenCalledWith("9998887777");
    await waitFor(() => {
      expect(message.success).toHaveBeenCalledWith("Phone number copied");
    });
  });

  it("re-fetches with the search term when searching", async () => {
    renderPage();
    await screen.findByText("Acme Corp");

    const searchInput = screen.getByPlaceholderText("Search company name");
    await userEvent.type(searchInput, "Acme{Enter}");

    await waitFor(() => {
      expect(customerApi.listCustomers).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: "Acme" })
      );
    });
  });

  it("shows inactive customers when the status filter is set to Inactive", async () => {
    renderPage();
    await screen.findByText("Acme Corp");

    await userEvent.click(screen.getByRole("combobox", { name: "Status" }));
    await userEvent.click(await screen.findByTitle("Inactive"));

    await waitFor(() => {
      expect(customerApi.listCustomers).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: "inactive" })
      );
    });
  });

  it("shows every customer regardless of status when the status filter is set to All", async () => {
    renderPage();
    await screen.findByText("Acme Corp");

    await userEvent.click(screen.getByRole("combobox", { name: "Status" }));
    await userEvent.click(await screen.findByTitle("All"));

    await waitFor(() => {
      expect(customerApi.listCustomers).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: "" })
      );
    });
  });

  it("selecting rows and running a bulk action calls the bulk endpoint with the selected ids", async () => {
    customerApi.bulkUpdateCustomers.mockResolvedValue({ data: { data: [] } });
    renderPage();
    await screen.findByText("Acme Corp");

    const checkboxes = screen.getAllByRole("checkbox");
    const rowCheckbox = checkboxes[1];
    await userEvent.click(rowCheckbox);

    expect(await screen.findByText("1 selected")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Mark Inactive" }));

    await waitFor(() => {
      expect(customerApi.bulkUpdateCustomers).toHaveBeenCalledWith({
        ids: ["cust-1"],
        action: "deactivate",
      });
    });
  });

  it("sorts by Signed Up date when the column header is clicked", async () => {
    renderPage();
    await screen.findByText("Acme Corp");

    await userEvent.click(screen.getByText("Signed Up"));

    const rows = screen.getAllByRole("row");
    // rows[0] is the header row; after ascending sort, the earlier date (Acme) leads.
    expect(within(rows[1]).queryByText("Acme Corp")).toBeInTheDocument();
  });

  it("toggling status from the table's per-row Actions column calls the same PATCH endpoint and refreshes the table, with no full page reload", async () => {
    customerApi.updateCustomer.mockResolvedValue({
      data: { data: { ...SAMPLE_CUSTOMERS[0], customerStatus: "inactive" } },
    });
    renderPage();
    await screen.findByText("Acme Corp");

    const acmeRow = screen.getByText("Acme Corp").closest("tr");
    await userEvent.click(within(acmeRow).getByRole("button", { name: /Deactivate/ }));

    const confirmButtons = await screen.findAllByRole("button", { name: /Deactivate/ });
    await userEvent.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => {
      expect(customerApi.updateCustomer).toHaveBeenCalledWith("cust-1", { customerStatus: "inactive" });
    });
    // `onChanged` is the same `refetch` the rest of the page already uses —
    // a second `listCustomers` call (beyond the initial mount fetch) is what
    // proves the table refreshes itself rather than needing a reload.
    await waitFor(() => {
      expect(customerApi.listCustomers).toHaveBeenCalledTimes(2);
    });
  });

  it("shows Activate (no confirmation) in the Actions column for an already-inactive row", async () => {
    customerApi.listCustomers.mockResolvedValue({
      data: { data: [{ ...SAMPLE_CUSTOMERS[0], customerStatus: "inactive" }, SAMPLE_CUSTOMERS[1]] },
    });
    renderPage();
    await screen.findByText("Acme Corp");

    const acmeRow = screen.getByText("Acme Corp").closest("tr");
    expect(within(acmeRow).getByRole("button", { name: /Activate/ })).toBeInTheDocument();
    expect(within(acmeRow).queryByRole("button", { name: /Deactivate/ })).not.toBeInTheDocument();
  });
});

describe("CustomersListPage — Add Customer wizard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    customerApi.listCustomers.mockResolvedValue({ data: { data: SAMPLE_CUSTOMERS } });
    customerApi.listContracts.mockResolvedValue({ data: { data: [] } });
    fetchUserDropdown.mockResolvedValue({
      data: { data: [{ _id: "user-1", name: "Priya PM", role: "manager" }] },
    });
    useSessionStore.setState({
      user: { _id: "admin-1", role: "admin", permissions: {} },
      isAuthenticated: true,
      isLoading: false,
    });
  });

  it("walks the steps, submits the full payload, and shows the automation feedback", async () => {
    customerApi.createCustomer.mockResolvedValue({ data: { data: { _id: "new-cust" } } });
    customerApi.createContract.mockResolvedValue({ data: { data: { _id: "contract-1" } } });

    renderPage();
    await screen.findByText("Acme Corp");

    await userEvent.click(screen.getByRole("button", { name: /Add Customer/ }));

    // Step 0: Company Info
    await userEvent.type(await screen.findByLabelText("Company Name"), "New Co");
    await userEvent.click(screen.getByRole("button", { name: "Next" }));

    // Step 1: Billing — skip, just advance.
    await userEvent.click(await screen.findByRole("button", { name: "Next" }));

    // Step 2: Contracts — add one one-time contract. ("Monthly" is
    // intentionally hidden from this picker — see CONTRACT_TYPE_UI_OPTIONS —
    // so this covers the automation path with a type that's actually
    // selectable here.)
    await userEvent.click(await screen.findByRole("button", { name: /Add Contract/ }));
    await userEvent.click(screen.getByRole("combobox", { name: "Contract type" }));
    await userEvent.click(await screen.findByTitle("One-time"));
    await userEvent.click(screen.getByRole("button", { name: "Next" }));

    // Step 3: Contacts — skip.
    await userEvent.click(await screen.findByRole("button", { name: "Next" }));

    // Step 4: Project Manager — required.
    await userEvent.click(await screen.findByLabelText("Project Manager"));
    await userEvent.click(await screen.findByTitle("Priya PM"));

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(customerApi.createCustomer).toHaveBeenCalledWith(
        expect.objectContaining({ companyName: "New Co", projectManagerId: "user-1" })
      );
    });

    await waitFor(() => {
      expect(customerApi.createContract).toHaveBeenCalledWith(
        "new-cust",
        expect.objectContaining({ type: "onetime" })
      );
    });

    await waitFor(() => {
      expect(message.success).toHaveBeenCalledWith(
        expect.stringContaining("Project + draft Invoice auto-created")
      );
    });
  });
});

describe("CustomersListPage — permission gating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    customerApi.listCustomers.mockResolvedValue({ data: { data: SAMPLE_CUSTOMERS } });
    customerApi.listContracts.mockResolvedValue({ data: { data: [] } });
    fetchUserDropdown.mockResolvedValue({
      data: { data: [{ _id: "user-1", name: "Priya PM", role: "manager" }] },
    });
  });

  it("hides Add Customer for a role with no customers.create grant", async () => {
    useSessionStore.setState({
      user: { _id: "employee-1", role: "employee", permissions: { customers: { view: true } } },
      isAuthenticated: true,
      isLoading: false,
    });

    renderPage();
    await screen.findByText("Acme Corp");

    expect(screen.queryByRole("button", { name: /Add Customer/ })).not.toBeInTheDocument();
  });
});
