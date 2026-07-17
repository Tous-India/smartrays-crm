import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import LeadsListPage from "./LeadsListPage";
import useSessionStore from "../../../store/sessionStore";
import * as leadApi from "../api/leadApi";

vi.mock("../api/leadApi", () => ({
  listLeads: vi.fn(),
  createLead: vi.fn(),
  updateLead: vi.fn(),
  deleteLead: vi.fn(),
  changeLeadStatus: vi.fn(),
  toggleHotFlag: vi.fn(),
  logLeadCall: vi.fn(),
  getLeadCallHistory: vi.fn(),
  convertLeadToCustomer: vi.fn(),
  importLeads: vi.fn(),
  exportLeads: vi.fn(),
  getLeadSources: vi.fn(),
}));

vi.mock("../../../services/userDirectoryApi", () => ({
  fetchUserDropdown: vi.fn(),
}));

const { fetchUserDropdown } = await import("../../../services/userDirectoryApi");

const SAMPLE_LEADS = [
  {
    _id: "lead-1",
    name: "Jane Doe",
    companyName: "Acme Corp",
    status: "new",
    source: "Website",
    ownerId: "user-1",
    followUpDate: null,
    budget: 5000,
    isHot: false,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
];

function renderLeadsListPage() {
  return render(
    <MemoryRouter initialEntries={["/leads"]}>
      <LeadsListPage view="table" />
    </MemoryRouter>
  );
}

describe("LeadsListPage — Table view", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    leadApi.listLeads.mockResolvedValue({ data: { data: SAMPLE_LEADS } });
    leadApi.getLeadSources.mockResolvedValue({ data: { data: [] } });
    fetchUserDropdown.mockResolvedValue({
      data: { data: [{ _id: "user-1", name: "Sam Sales", role: "sales_associate" }] },
    });
    useSessionStore.setState({
      user: { _id: "admin-1", role: "admin", permissions: {} },
      isAuthenticated: true,
      isLoading: false,
    });
  });

  it("renders the fetched leads", async () => {
    renderLeadsListPage();

    expect(await screen.findByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
    expect(leadApi.listLeads).toHaveBeenCalledWith({ search: "", owner: "", followUp: "" });
  });

  it("re-fetches with the search term when searching", async () => {
    renderLeadsListPage();
    await screen.findByText("Jane Doe");

    const searchInput = screen.getByPlaceholderText("Search name, company, email, phone");
    await userEvent.type(searchInput, "Acme{Enter}");

    await waitFor(() => {
      expect(leadApi.listLeads).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: "Acme" })
      );
    });
  });

  it("re-fetches with the follow-up filter when changed", async () => {
    renderLeadsListPage();
    await screen.findByText("Jane Doe");

    // The follow-up Select is the one currently showing "All".
    const followUpSelect = screen.getAllByText("All")[0];
    await userEvent.click(followUpSelect);
    await userEvent.click(await screen.findByTitle("Overdue"));

    await waitFor(() => {
      expect(leadApi.listLeads).toHaveBeenLastCalledWith(
        expect.objectContaining({ followUp: "overdue" })
      );
    });
  });

  it("changes status via the inline dropdown for a plain transition", async () => {
    leadApi.changeLeadStatus.mockResolvedValue({});
    renderLeadsListPage();

    const row = (await screen.findByText("Jane Doe")).closest("tr");
    const statusSelect = within(row).getByTitle("New");
    await userEvent.click(statusSelect);
    await userEvent.click(await screen.findByTitle("Contacted"));

    await waitFor(() => {
      expect(leadApi.changeLeadStatus).toHaveBeenCalledWith("lead-1", { status: "contacted" });
    });
  });

  it("prompts for a reason before calling the endpoint when moving to Lost", async () => {
    renderLeadsListPage();

    const row = (await screen.findByText("Jane Doe")).closest("tr");
    const statusSelect = within(row).getByTitle("New");
    await userEvent.click(statusSelect);
    await userEvent.click(await screen.findByTitle("Lost"));

    expect(await screen.findByText('Mark "Jane Doe" as Lost')).toBeInTheDocument();
    expect(leadApi.changeLeadStatus).not.toHaveBeenCalled();
  });
});

describe("LeadsListPage — permission gating (UI convenience only, backend is the real gate)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    leadApi.listLeads.mockResolvedValue({ data: { data: SAMPLE_LEADS } });
    leadApi.getLeadSources.mockResolvedValue({ data: { data: [] } });
    fetchUserDropdown.mockResolvedValue({
      data: { data: [{ _id: "user-1", name: "Sam Sales", role: "sales_associate" }] },
    });
  });

  it("hides New Lead/Import for a role with no leads.create grant", async () => {
    useSessionStore.setState({
      user: { _id: "employee-1", role: "employee", permissions: { leads: { view: true } } },
      isAuthenticated: true,
      isLoading: false,
    });

    renderLeadsListPage();
    await screen.findByText("Jane Doe");

    // Ant Design's Button computes its accessible name from the icon's
    // aria-label plus the visible text (e.g. "plus New Lead").
    expect(screen.queryByRole("button", { name: /New Lead/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Import/ })).not.toBeInTheDocument();
    // view is granted, so Export still shows.
    expect(screen.getByRole("button", { name: /Export/ })).toBeInTheDocument();
  });

  it("shows a read-only status tag instead of an editable dropdown for a role with no leads.edit grant", async () => {
    useSessionStore.setState({
      user: { _id: "employee-1", role: "employee", permissions: { leads: { view: true } } },
      isAuthenticated: true,
      isLoading: false,
    });

    renderLeadsListPage();
    const row = (await screen.findByText("Jane Doe")).closest("tr");

    expect(within(row).getByText("New")).toBeInTheDocument();
    expect(within(row).queryByTitle("New")).not.toBeInTheDocument();
  });

  it("shows the full action set for an admin (bypasses all permission checks)", async () => {
    useSessionStore.setState({
      user: { _id: "admin-1", role: "admin", permissions: {} },
      isAuthenticated: true,
      isLoading: false,
    });

    renderLeadsListPage();
    await screen.findByText("Jane Doe");

    expect(screen.getByRole("button", { name: /New Lead/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Import/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Export/ })).toBeInTheDocument();
  });
});
