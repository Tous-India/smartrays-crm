import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "antd";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ComplaintsPage from "./ComplaintsPage";
import useSessionStore from "../../../store/sessionStore";
import * as complaintApi from "../api/complaintApi";

vi.mock("../api/complaintApi", () => ({
  listComplaints: vi.fn(),
}));

const HOUR = 3600000;
const ago = (hours) => new Date(Date.now() - hours * HOUR).toISOString();

const ADMIN = { _id: "admin-1", name: "Vinay Gupta", role: "admin", permissions: {} };
const COORDINATOR = { _id: "c-1", name: "Office", role: "employee", permissions: { complaints: { view_all: true, assign: true } } };
const TECHNICIAN = { _id: "tech-1", name: "Suresh Kumar", role: "employee", permissions: {} };

const ROWS = [
  { _id: "a", number: 1006, status: "open", priority: null, contactName: "Meena Joshi", contactPhone: "98765 43210", customerName: null, description: "Panels look dusty and output is low.", assigneeName: null, visitDate: null, createdAt: ago(2) },
  { _id: "b", number: 1005, status: "assigned", priority: "urgent", contactName: "Ramesh", contactPhone: "98100 12345", customerName: "Sharma Residence", description: "Inverter red light", assigneeName: "Suresh Kumar", visitDate: "2026-10-25", createdAt: ago(5) },
  { _id: "c", number: 1001, status: "resolved", priority: "low", contactName: "Anil", contactPhone: "99999 88888", customerName: null, description: "Meter reading", assigneeName: "Suresh Kumar", visitDate: "2026-10-20", createdAt: ago(80) },
];

function renderPage(user) {
  useSessionStore.setState({ user });
  return render(
    <App>
      <MemoryRouter initialEntries={["/complaints"]}>
        <Routes>
          <Route path="/complaints" element={<ComplaintsPage />} />
          <Route path="/complaints/:id" element={<p>Detail page</p>} />
        </Routes>
      </MemoryRouter>
    </App>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  complaintApi.listComplaints.mockResolvedValue({ data: { data: ROWS } });
});

describe("ComplaintsPage — the assigners' list", () => {
  it("lists every complaint with priority, name, phone, short description and age; unassigned highlighted on top", async () => {
    renderPage(ADMIN);

    expect(await screen.findByRole("heading", { name: "Complaints" })).toBeInTheDocument();
    const rows = screen.getAllByTestId("complaint-row");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveAttribute("data-unassigned", "true");
    expect(within(rows[0]).getByText("Not assigned")).toBeInTheDocument();
    expect(within(rows[0]).getByText("Meena Joshi")).toBeInTheDocument();
    expect(within(rows[0]).getByText(/98765 43210/)).toBeInTheDocument();
    expect(within(rows[0]).getByText(/2 h ago/)).toBeInTheDocument();
    expect(within(rows[1]).getByText("Urgent")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Sharma Residence")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Share complaint link/ })).toBeInTheDocument();
  });

  it("filters Unassigned / Assigned / Resolved", async () => {
    renderPage(COORDINATOR);
    const user = userEvent.setup();
    await screen.findAllByTestId("complaint-row");

    await user.click(screen.getByText(/^Unassigned/));
    expect(screen.getAllByTestId("complaint-row").map((row) => row.dataset.number)).toEqual(["1006"]);
    await user.click(screen.getByText(/^Assigned/));
    expect(screen.getAllByTestId("complaint-row").map((row) => row.dataset.number)).toEqual(["1005"]);
    await user.click(screen.getByText(/^Resolved/));
    expect(screen.getAllByTestId("complaint-row").map((row) => row.dataset.number)).toEqual(["1001"]);
  });

  it("opens a complaint on tap", async () => {
    renderPage(ADMIN);
    const user = userEvent.setup();
    await user.click((await screen.findAllByTestId("complaint-row"))[1]);
    expect(await screen.findByText("Detail page")).toBeInTheDocument();
  });
});

describe("ComplaintsPage — a technician's 'My complaints'", () => {
  it("is titled My complaints, without the share button or the assigners' filters", async () => {
    complaintApi.listComplaints.mockResolvedValue({ data: { data: ROWS.slice(1) } });
    renderPage(TECHNICIAN);

    expect(await screen.findByRole("heading", { name: "My complaints" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Share complaint link/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/^Unassigned/)).not.toBeInTheDocument();
    // Active first by default.
    expect(screen.getAllByTestId("complaint-row").map((row) => row.dataset.number)).toEqual(["1005"]);
  });
});
