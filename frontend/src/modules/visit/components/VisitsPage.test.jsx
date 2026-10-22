import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import VisitsPage from "./VisitsPage";
import useSessionStore from "../../../store/sessionStore";
import * as visitApi from "../api/visitApi";
import { explainVisit } from "../constants/visit.constants";

vi.mock("antd", async (importOriginal) => {
  const actual = await importOriginal();
  const mockMessage = { success: vi.fn(), error: vi.fn(), warning: vi.fn() };
  actual.App.useApp = () => ({ message: mockMessage });
  return { ...actual, message: mockMessage };
});
vi.mock("./VisitMap", () => ({ default: ({ onPick }) => <button type="button" data-testid="visit-map" onClick={() => onPick?.({ lat: 28.49, lng: 77.09 })}>map</button> }));
vi.mock("../api/visitApi", () => ({
  listVisits: vi.fn(),
  getVisit: vi.fn(),
  createVisit: vi.fn(),
  listVisitAssignees: vi.fn(),
  listVisitCustomers: vi.fn(),
  findAddress: vi.fn(),
}));
vi.mock("../../location/api/locationApi", () => ({ fetchLocationHistory: vi.fn(async () => ({ data: { data: { pings: [] } } })) }));

const MANAGER = { _id: "mgr-1", name: "Sandeep", role: "manager", permissions: { services: { view: true, create: true } } };
const today = new Date().toISOString();
const t = (h, m) => { const d = new Date(); d.setHours(h, m, 0, 0); return d.toISOString(); };

const VISITS = [
  { _id: "v1", status: "verified", purpose: "Panel cleaning", dueDate: today, customer: { companyName: "Green Valley" }, assignee: { _id: "e1", name: "Deepak" }, arrival: { at: t(10, 40) }, completion: { at: t(11, 30) }, minutesOnSite: 50, photos: [] },
  { _id: "v2", status: "not_at_site", purpose: "Inspection", dueDate: today, customer: { companyName: "Sharma Residence" }, assignee: { _id: "e2", name: "Ritu" }, arrival: null, completion: null },
  { _id: "v3", status: "left_early", purpose: "Structure check", dueDate: today, customer: { companyName: "Balaji Textiles" }, assignee: { _id: "e3", name: "Manoj" }, arrival: { at: t(11, 0) }, completion: null, leftAt: t(11, 47) },
];

function renderPage(path = "/visits") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/visits" element={<VisitsPage />} />
        <Route path="/visits/:id" element={<VisitsPage />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useSessionStore.setState({ user: MANAGER });
  visitApi.listVisits.mockResolvedValue({ data: { data: VISITS } });
});

describe("VisitsPage", () => {
  it("shows each visit's verdict with a plain reason, problems first", async () => {
    renderPage();

    const items = await screen.findAllByRole("listitem");
    expect(within(items[0]).getByText("Not at site")).toBeInTheDocument();
    expect(within(items[1]).getByText("Left early")).toBeInTheDocument();
    expect(within(items[2]).getByText("Verified")).toBeInTheDocument();
    expect(screen.getByText("2 need a look")).toBeInTheDocument();
    expect(within(items[0]).getByText(/Arrived can only be tapped at the site/)).toBeInTheDocument();
  });

  it("explains each verdict in one sentence", () => {
    expect(explainVisit(VISITS[0])).toMatch(/^Arrived .+ and marked done .+ at the site \(50 min\)\./);
    expect(explainVisit(VISITS[2])).toMatch(/the phone left the site at .+ and the visit was never marked done/);
    expect(explainVisit({ status: "not_started" })).toBe("Not started yet.");
  });

  it("assigns a visit: customer, purpose, person, site — the customer's saved site is used", async () => {
    visitApi.listVisitCustomers.mockResolvedValue({ data: { data: [{ _id: "c1", companyName: "Verma Villa", siteAddress: "Dwarka", siteLocation: { lat: 28.58, lng: 77.05 } }] } });
    visitApi.listVisitAssignees.mockResolvedValue({ data: { data: [{ _id: "e1", name: "Deepak" }] } });
    visitApi.createVisit.mockResolvedValue({ data: { data: {} } });
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: /Assign a visit/ }));
    const dialog = await screen.findByRole("dialog");
    const [customerSelect, personSelect] = within(dialog).getAllByRole("combobox").filter((el) => el.closest(".ant-select"));
    await user.click(customerSelect);
    await user.click(await screen.findByTitle("Verma Villa"));
    await user.click(within(dialog).getByText("Inspection"));
    await user.click(personSelect);
    await user.click(await screen.findByTitle("Deepak"));
    await user.click(within(dialog).getByRole("button", { name: "Assign visit" }));

    await waitFor(() => expect(visitApi.createVisit).toHaveBeenCalled());
    const payload = visitApi.createVisit.mock.calls[0][0];
    expect(payload).toEqual(expect.objectContaining({ customerId: "c1", assignedToId: "e1", purpose: "Inspection", site: { lat: 28.58, lng: 77.05 }, saveToCustomer: true }));
  });

  it("keeps Assign disabled until a site is placed", async () => {
    visitApi.listVisitCustomers.mockResolvedValue({ data: { data: [{ _id: "c2", companyName: "New Site Co", siteAddress: null, siteLocation: null }] } });
    visitApi.listVisitAssignees.mockResolvedValue({ data: { data: [{ _id: "e1", name: "Deepak" }] } });
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: /Assign a visit/ }));
    const dialog = await screen.findByRole("dialog");
    const [customerSelect, personSelect] = within(dialog).getAllByRole("combobox").filter((el) => el.closest(".ant-select"));
    await user.click(customerSelect);
    await user.click(await screen.findByTitle("New Site Co"));
    await user.click(personSelect);
    await user.click(await screen.findByTitle("Deepak"));

    expect(within(dialog).getByRole("button", { name: "Assign visit" })).toBeDisabled();
    await user.click(within(dialog).getByTestId("visit-map"));
    expect(within(dialog).getByRole("button", { name: "Assign visit" })).toBeEnabled();
  });
});
