import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ComplaintsPage from "./ComplaintsPage";
import useSessionStore from "../../../store/sessionStore";
import * as complaintApi from "../api/complaintApi";

vi.mock("antd", async (importOriginal) => {
  const actual = await importOriginal();
  const mockMessage = { success: vi.fn(), error: vi.fn() };
  actual.App.useApp = () => ({ message: mockMessage });
  return { ...actual, message: mockMessage };
});

vi.mock("../api/complaintApi", () => ({
  listComplaints: vi.fn(),
  getComplaint: vi.fn(),
  changeComplaintStatus: vi.fn(),
  addComplaintComment: vi.fn(),
  reassignComplaint: vi.fn(),
}));

vi.mock("../../../services/userDirectoryApi", () => ({
  fetchUserDropdown: vi.fn(async () => ({ data: { data: [] } })),
}));

const HOUR = 3600000;
const ago = (hours) => new Date(Date.now() - hours * HOUR).toISOString();

const EMPLOYEE = { _id: "emp-1", name: "Ritu", role: "employee", permissions: { tickets: { view_assigned: true } } };

const TICKETS = [
  { _id: "t1", number: 1001, status: "open", category: "technical", subject: "Technical — inverter beeping", customerName: "Sharma Residence", assignedToId: "emp-1", assigneeName: "Ritu", createdAt: ago(1) },
  { _id: "t2", number: 1002, status: "open", category: "installation", subject: "Installation — loose wire", customerName: "Verma Villa", assignedToId: "emp-1", assigneeName: "Ritu", createdAt: ago(6) },
  { _id: "t3", number: 1003, status: "in_progress", category: "sales_billing", subject: "Sales / Billing — wrong bill", customerName: "Kapil Clinic", assignedToId: "emp-1", assigneeName: "Ritu", createdAt: ago(3) },
  { _id: "t4", number: 1000, status: "resolved", category: "other", subject: "Other — call me", customerName: "Saxena Home", assignedToId: "emp-1", assigneeName: "Ritu", createdAt: ago(80) },
];

const DETAIL = {
  _id: "t2",
  number: 1002,
  status: "open",
  category: "installation",
  source: "complaint_link",
  callbackTime: "evening",
  description: "A wire is hanging near the panels",
  customer: { _id: "c1", companyName: "Verma Villa", phone: "+91 99990 10000", siteAddress: "Sector 12, Dwarka", primaryContact: { name: "Anita Verma", phone: "+91 98990 20000" } },
  assignedTo: { _id: "emp-1", name: "Ritu" },
  photoUrls: ["https://signed.test/p1"],
  createdAt: ago(6),
  acknowledgedAt: null,
  resolvedAt: null,
  escalations: [],
  history: [{ type: "comment", by: "Customer", comment: "A wire is hanging near the panels", createdAt: ago(6) }],
};

function renderPage(path = "/complaints") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/complaints" element={<ComplaintsPage />} />
        <Route path="/complaints/:id" element={<ComplaintsPage />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useSessionStore.setState({ user: EMPLOYEE });
  complaintApi.listComplaints.mockResolvedValue({ data: { data: TICKETS } });
  complaintApi.getComplaint.mockResolvedValue({ data: { data: DETAIL } });
  complaintApi.changeComplaintStatus.mockResolvedValue({ data: { data: {} } });
});

describe("ComplaintsPage", () => {
  it("splits complaints into Waiting / In progress / Resolved with counts", async () => {
    renderPage();

    expect(await screen.findByText(/Verma Villa/)).toBeInTheDocument();
    expect(screen.getByText("Waiting (2)")).toBeInTheDocument();
    expect(screen.getByText("In progress (1)")).toBeInTheDocument();
    expect(screen.getByText("Resolved (1)")).toBeInTheDocument();
    expect(screen.queryByText(/Kapil Clinic/)).not.toBeInTheDocument();
  });

  it("puts the overdue one first and says so in red words", async () => {
    renderPage();

    const items = await screen.findAllByRole("listitem");
    expect(within(items[0]).getByText(/Verma Villa/)).toBeInTheDocument();
    expect(within(items[0]).getByText("Not picked up for 6 h")).toBeInTheDocument();
    expect(within(items[1]).queryByText(/Not picked up/)).not.toBeInTheDocument();
  });

  it("opens a complaint with a one-tap call button and the customer's words", async () => {
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByText(/Verma Villa/));

    const call = await screen.findByRole("link", { name: /Call Anita Verma/ });
    expect(call).toHaveAttribute("href", "tel:+919899020000");
    expect(screen.getByText("Wants a call:")).toBeInTheDocument();
    expect(screen.getAllByText("A wire is hanging near the panels").length).toBeGreaterThan(0);
    expect(screen.getByAltText("Customer photo 1")).toHaveAttribute("src", "https://signed.test/p1");
  });

  it("lets the assignee say I'm on it", async () => {
    renderPage("/complaints/t2");
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "I'm on it" }));

    expect(complaintApi.changeComplaintStatus).toHaveBeenCalledWith("t2", "in_progress");
  });

  it("does not show the action buttons to someone who is not the assignee", async () => {
    useSessionStore.setState({ user: { ...EMPLOYEE, _id: "emp-2" } });
    renderPage("/complaints/t2");

    expect(await screen.findByRole("link", { name: /Call Anita Verma/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "I'm on it" })).not.toBeInTheDocument();
  });
});
