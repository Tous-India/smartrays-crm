import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import LeadsListPage from "./LeadsListPage";
import useSessionStore from "../../../store/sessionStore";
import * as leadApi from "../api/leadApi";

// Leads on a phone (2026-10-23): "Needs attention" shows the 3 most urgent
// with "Show all", and the wide table becomes a list of cards with a Call button.
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
vi.mock("../../../services/userDirectoryApi", () => ({ fetchUserDropdown: vi.fn() }));
const { fetchUserDropdown } = await import("../../../services/userDirectoryApi");

const tomorrow = new Date(Date.now() + 24 * 3600000).toISOString();
const LEADS = Array.from({ length: 6 }, (_, index) => ({
  _id: `lead-${index}`,
  name: `Lead ${index}`,
  companyName: `Company ${index}`,
  phone: `+91 97110 4000${index}`,
  status: "contacted",
  ownerId: "user-1",
  followUpDate: tomorrow,
  isHot: index === 0,
  createdAt: "2026-10-01T00:00:00.000Z",
}));

const realMatchMedia = window.matchMedia;

beforeEach(() => {
  vi.clearAllMocks();
  window.matchMedia = (query) => ({
    matches: query.includes("max-width: 767px"),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
  leadApi.listLeads.mockResolvedValue({ data: { data: LEADS } });
  leadApi.getLeadSources.mockResolvedValue({ data: { data: [] } });
  fetchUserDropdown.mockResolvedValue({ data: { data: [{ _id: "user-1", name: "Karan", role: "employee" }] } });
  useSessionStore.setState({ user: { _id: "admin-1", role: "admin", permissions: {} }, isAuthenticated: true, isLoading: false });
});

afterEach(() => {
  window.matchMedia = realMatchMedia;
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/leads"]}>
      <LeadsListPage view="table" />
    </MemoryRouter>
  );
}

describe("LeadsListPage on a phone", () => {
  it("shows only the 3 most urgent in Needs attention, with Show all", async () => {
    renderPage();
    const section = await screen.findByTestId("priority-leads");

    expect(within(section).getAllByTestId("priority-lead-card")).toHaveLength(3);
    await userEvent.click(within(section).getByRole("button", { name: "Show all 6" }));
    expect(within(section).getAllByTestId("priority-lead-card")).toHaveLength(6);
  });

  it("lists leads as cards with a Call button instead of the wide table", async () => {
    renderPage();
    const list = await screen.findByTestId("lead-mobile-list");

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    const firstCard = within(list).getAllByTestId("lead-mobile-card")[0];
    expect(within(firstCard).getByText("Lead 0")).toBeInTheDocument();
    expect(within(firstCard).getByText("Contacted")).toBeInTheDocument();
    expect(within(firstCard).getByRole("link", { name: /Call/ })).toHaveAttribute("href", "tel:+919711040000");
  });
});
