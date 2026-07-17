import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import LeadDetailPage from "./LeadDetailPage";
import useSessionStore from "../store/sessionStore";
import * as leadApi from "../modules/lead/api/leadApi";

vi.mock("../modules/lead/api/leadApi", () => ({
  getLead: vi.fn(),
  getLeadCallHistory: vi.fn(),
  updateLead: vi.fn(),
  deleteLead: vi.fn(),
  logLeadCall: vi.fn(),
  convertLeadToCustomer: vi.fn(),
  changeLeadStatus: vi.fn(),
  // LeadFormModal (rendered off-screen for the Edit action) and
  // ImportWizardModal both call useLeadSources() unconditionally on mount —
  // the modal being closed doesn't stop its component function from running.
  getLeadSources: vi.fn().mockResolvedValue({ data: { data: [] } }),
}));

vi.mock("../services/userDirectoryApi", () => ({
  fetchUserDropdown: vi.fn().mockResolvedValue({
    data: { data: [{ _id: "pm-1", name: "Priya PM", role: "manager" }] },
  }),
}));

const SAMPLE_LEAD = {
  _id: "lead-1",
  name: "Jane Doe",
  email: "jane@example.com",
  phone: "555-0100",
  companyName: "Acme Corp",
  source: "Website",
  status: "new",
  ownerId: "pm-1",
  budget: 5000,
  followUpDate: null,
  followUpNote: null,
  notes: "Interested in the pro plan",
  isHot: false,
  lostReason: null,
  convertedCustomerId: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function renderDetailPage() {
  return render(
    <MemoryRouter initialEntries={["/leads/lead-1"]}>
      <Routes>
        <Route path="/leads/:id" element={<LeadDetailPage />} />
        <Route path="/customers/:id" element={<div>Customer Page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("LeadDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    leadApi.getLead.mockResolvedValue({ data: { data: SAMPLE_LEAD } });
    leadApi.getLeadCallHistory.mockResolvedValue({ data: { data: [] } });
    useSessionStore.setState({
      user: { _id: "admin-1", role: "admin", permissions: {} },
      isAuthenticated: true,
      isLoading: false,
    });
  });

  it("renders the lead's fields", async () => {
    renderDetailPage();

    expect(await screen.findByText("jane@example.com")).toBeInTheDocument();
    expect(screen.getByText("555-0100")).toBeInTheDocument();
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
    expect(screen.getByText("Interested in the pro plan")).toBeInTheDocument();
  });

  it("logs a call and refetches the call history", async () => {
    leadApi.logLeadCall.mockResolvedValue({});
    leadApi.getLeadCallHistory
      .mockResolvedValueOnce({ data: { data: [] } })
      .mockResolvedValueOnce({
        data: {
          data: [
            {
              _id: "call-1",
              calledAt: "2026-01-02T10:00:00.000Z",
              outcome: "connected",
              notes: "Discussed pricing",
            },
          ],
        },
      });

    renderDetailPage();
    await screen.findByText("jane@example.com");

    await userEvent.click(screen.getByRole("button", { name: /Log Call/ }));
    // AntD's dropdown open transition briefly leaves the trigger with
    // `pointer-events: none` — skip that check, same as clicking through a
    // CSS transition a real user wouldn't be blocked by either.
    await userEvent.click(await screen.findByText("Select an outcome"), {
      pointerEventsCheck: 0,
    });
    await userEvent.click(await screen.findByTitle("Connected"), { pointerEventsCheck: 0 });

    const dateInput = screen.getByPlaceholderText("Select date");
    await userEvent.type(dateInput, "2026-01-02 10:00:00{Enter}");

    await userEvent.click(screen.getByRole("button", { name: "OK" }));

    await waitFor(() => {
      expect(leadApi.logLeadCall).toHaveBeenCalledWith(
        "lead-1",
        expect.objectContaining({ outcome: "connected" })
      );
    });

    expect(await screen.findByText(/Discussed pricing/)).toBeInTheDocument();
  });

  it("toggles the hot flag", async () => {
    leadApi.updateLead.mockResolvedValue({});
    renderDetailPage();
    await screen.findByText("jane@example.com");

    await userEvent.click(screen.getByRole("button", { name: /Mark as Hot/ }));

    await waitFor(() => {
      expect(leadApi.updateLead).toHaveBeenCalledWith("lead-1", { isHot: true });
    });
  });

  it("pre-fills and submits the Convert-to-Customer form", async () => {
    leadApi.convertLeadToCustomer.mockResolvedValue({ data: { data: { _id: "customer-1" } } });
    renderDetailPage();
    await screen.findByText("jane@example.com");

    await userEvent.click(screen.getByRole("button", { name: /Convert to Customer/ }));

    const companyInput = await screen.findByLabelText("Company Name");
    expect(companyInput).toHaveValue("Acme Corp");
    expect(screen.getByLabelText("Email")).toHaveValue("jane@example.com");

    await userEvent.click(screen.getByLabelText("Project Manager"));
    await userEvent.click(await screen.findByTitle("Priya PM (manager)"));

    await userEvent.click(screen.getByRole("button", { name: "Convert" }));

    await waitFor(() => {
      expect(leadApi.convertLeadToCustomer).toHaveBeenCalledWith(
        "lead-1",
        expect.objectContaining({ companyName: "Acme Corp", projectManagerId: "pm-1" })
      );
    });

    expect(await screen.findByText("Customer Page")).toBeInTheDocument();
  });
});
