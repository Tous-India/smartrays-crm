import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "antd";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ComplaintDetailPage from "./ComplaintDetailPage";
import useSessionStore from "../../../store/sessionStore";
import * as complaintApi from "../api/complaintApi";

vi.mock("../api/complaintApi", () => ({
  getComplaint: vi.fn(),
  listComplaintAssignees: vi.fn(),
  assignComplaint: vi.fn(),
  changeComplaintStatus: vi.fn(),
  addComplaintPhoto: vi.fn(),
  sendComplaintBack: vi.fn(),
  linkComplaintCustomer: vi.fn(),
  saveComplaintContact: vi.fn(),
  searchComplaintCustomers: vi.fn(),
}));

const ADMIN = { _id: "admin-1", name: "Vinay Gupta", role: "admin", permissions: {} };
const TECHNICIAN = { _id: "tech-1", name: "Suresh Kumar", role: "employee", permissions: {} };

const BASE = {
  _id: "t1",
  number: 1004,
  status: "open",
  priority: null,
  visitDate: null,
  contactName: "Ramesh Sharma",
  contactPhone: "98100 12345",
  address: "B-12, Sector 7, Dwarka, New Delhi",
  location: { lat: 28.5921, lng: 77.046 },
  description: "Inverter shows a red light since morning.",
  callbackTime: "morning",
  matchedCustomer: { _id: "cust-1", companyName: "Sharma Residence", commissioningDate: "2025-03-14T00:00:00.000Z" },
  assignedTo: null,
  assignedBy: null,
  customerPhotos: [{ url: "https://signed.test/p1", at: "2026-10-23T05:00:00Z" }],
  staffPhotos: [],
  history: [{ type: "comment", by: "Customer", comment: "Inverter shows a red light since morning.", createdAt: "2026-10-23T05:00:00Z" }],
  createdAt: "2026-10-23T05:00:00Z",
  canAssign: true,
  canWork: true,
};

function renderPage(user, detail) {
  useSessionStore.setState({ user });
  complaintApi.getComplaint.mockResolvedValue({ data: { data: detail } });
  return render(
    <App>
      <MemoryRouter initialEntries={["/complaints/t1"]}>
        <Routes>
          <Route path="/complaints/:id" element={<ComplaintDetailPage />} />
        </Routes>
      </MemoryRouter>
    </App>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  complaintApi.listComplaintAssignees.mockResolvedValue({
    data: { data: [{ _id: "tech-1", name: "Suresh Kumar", role: "employee" }, { _id: "tech-2", name: "Ravi Verma", role: "employee" }] },
  });
});

describe("ComplaintDetailPage — everything about one complaint", () => {
  it("shows what the customer sent, the matched customer, one-tap call and Google Maps", async () => {
    renderPage(ADMIN, BASE);

    expect(await screen.findByRole("heading", { name: /Complaint 1004/ })).toBeInTheDocument();
    expect(screen.getByText("Inverter shows a red light since morning.", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByText(/Existing customer: Sharma Residence, installed 14 Mar 2025/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Call 98100 12345/ })).toHaveAttribute("href", "tel:9810012345");
    expect(screen.getByRole("link", { name: /Open in Google Maps/ }).getAttribute("href")).toContain("28.5921,77.046");
    expect(screen.getByRole("img", { name: /Customer photo 1/ })).toBeInTheDocument();
    expect(screen.getByText(/Morning/)).toBeInTheDocument();
  });

  it("says plainly when the phone matched no customer", async () => {
    renderPage(ADMIN, { ...BASE, matchedCustomer: null });
    expect(await screen.findByText(/Not matched to an existing customer/)).toBeInTheDocument();
  });

  it("assigns: technician, priority and visit date", async () => {
    complaintApi.assignComplaint.mockResolvedValue({ data: { data: { ...BASE, status: "assigned" } } });
    renderPage(ADMIN, BASE);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Assign" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("combobox"));
    await user.click(await screen.findByTitle("Suresh Kumar"));
    await user.click(within(dialog).getByText("High"));
    const date = within(dialog).getByPlaceholderText("Visit date");
    await user.click(date);
    await user.type(date, "25 Oct 2026{enter}");
    await user.click(within(dialog).getByRole("button", { name: "Assign" }));

    expect(complaintApi.assignComplaint).toHaveBeenCalledWith("t1", { assignedToId: "tech-1", priority: "high", visitDate: "2026-10-25" });
  });

  it("the technician moves it forward, and must give a reason to send it back", async () => {
    const assigned = {
      ...BASE,
      status: "assigned",
      priority: "high",
      visitDate: "2026-10-25",
      assignedTo: { _id: "tech-1", name: "Suresh Kumar" },
      assignedBy: { _id: "admin-1", name: "Vinay Gupta" },
      canAssign: false,
      canWork: true,
    };
    complaintApi.changeComplaintStatus.mockResolvedValue({ data: { data: { ...assigned, status: "on_the_way" } } });
    complaintApi.sendComplaintBack.mockResolvedValue({ data: { data: { status: "open" } } });
    renderPage(TECHNICIAN, assigned);
    const user = userEvent.setup();

    expect(await screen.findByText(/Assigned by Vinay Gupta/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Assign" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "On the way" }));
    expect(complaintApi.changeComplaintStatus).toHaveBeenCalledWith("t1", "on_the_way", undefined);

    await user.click(screen.getByRole("button", { name: /Send back/ }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Send back" }));
    expect(complaintApi.sendComplaintBack).not.toHaveBeenCalled();
    await user.type(within(dialog).getByRole("textbox"), "This is a billing question, not technical.");
    await user.click(within(dialog).getByRole("button", { name: "Send back" }));
    expect(complaintApi.sendComplaintBack).toHaveBeenCalledWith("t1", "This is a billing question, not technical.");
  });

  it("resolving takes an optional note", async () => {
    const working = {
      ...BASE,
      status: "working",
      priority: "high",
      visitDate: "2026-10-25",
      assignedTo: { _id: "tech-1", name: "Suresh Kumar" },
      canAssign: false,
      canWork: true,
    };
    complaintApi.changeComplaintStatus.mockResolvedValue({ data: { data: { ...working, status: "resolved" } } });
    renderPage(TECHNICIAN, working);
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText(/Note/), "Replaced the fuse.");
    await user.click(screen.getByRole("button", { name: "Resolved" }));
    expect(complaintApi.changeComplaintStatus).toHaveBeenCalledWith("t1", "resolved", "Replaced the fuse.");
  });
});

// 2026-10-23: an unknown caller — what they typed, "Did you mean …?", link, save the number.
describe("ComplaintDetailPage — a caller the phone did not match", () => {
  const UNMATCHED = { ...BASE, matchedCustomer: null, companyName: "Gupta Industry", suggestedCustomers: [{ _id: "cust-9", companyName: "Gupta Industries" }], canSaveContact: false };

  it("shows the typed name, suggests a customer, links it, then offers to save the number", async () => {
    complaintApi.linkComplaintCustomer.mockResolvedValue({
      data: { data: { ...UNMATCHED, matchedCustomer: { _id: "cust-9", companyName: "Gupta Industries", commissioningDate: null }, suggestedCustomers: [], canSaveContact: true } },
    });
    complaintApi.saveComplaintContact.mockResolvedValue({
      data: { data: { ...UNMATCHED, matchedCustomer: { _id: "cust-9", companyName: "Gupta Industries" }, suggestedCustomers: [], canSaveContact: false } },
    });
    renderPage(ADMIN, UNMATCHED);
    const user = userEvent.setup();

    expect(await screen.findByText(/They typed: Gupta Industry/)).toBeInTheDocument();
    expect(screen.getByText(/Did you mean Gupta Industries\?/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Link to Gupta Industries" }));
    expect(complaintApi.linkComplaintCustomer).toHaveBeenCalledWith("t1", "cust-9");

    const save = await screen.findByRole("button", { name: /Save 98100 12345 as a contact for Gupta Industries/ });
    await user.click(save);
    expect(complaintApi.saveComplaintContact).toHaveBeenCalledWith("t1");
    expect(await screen.findByText(/Existing customer: Gupta Industries/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Save .* as a contact/ })).not.toBeInTheDocument();
  });

  it("a technician sees the typed name but cannot link", async () => {
    renderPage(TECHNICIAN, { ...UNMATCHED, canAssign: false, suggestedCustomers: [] });
    expect(await screen.findByText(/They typed: Gupta Industry/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Link to/ })).not.toBeInTheDocument();
  });
});
