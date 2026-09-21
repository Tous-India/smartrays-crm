import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import dayjs from "dayjs";
import TeamServicesWidget from "./TeamServicesWidget";
import useSessionStore from "../../../store/sessionStore";
import * as serviceApi from "../../service/api/serviceApi";
import * as userDirectoryApi from "../../../services/userDirectoryApi";

vi.mock("../../service/api/serviceApi", () => ({
  listServices: vi.fn(),
}));

vi.mock("../../../services/userDirectoryApi", () => ({
  fetchUserDropdown: vi.fn(),
}));

const yesterday = dayjs().subtract(1, "day").toISOString();
const soon = dayjs().add(2, "day").toISOString();

// What the SERVER returns for a manager: their team's items and their own.
const TEAM_OPEN = [
  { _id: "a1", title: "Ramesh undated", status: "todo", assignedToId: "emp-1", dueDate: null, subtasks: [], createdAt: "2026-09-01T00:00:00.000Z" },
  { _id: "b1", title: "Sunita overdue", status: "todo", assignedToId: "emp-2", dueDate: yesterday, subtasks: [], createdAt: "2026-09-02T00:00:00.000Z" },
  { _id: "m1", title: "Manager's own", status: "todo", assignedToId: "mgr-1", dueDate: soon, subtasks: [], createdAt: "2026-09-03T00:00:00.000Z" },
  { _id: "b2", title: "Sunita soon", status: "todo", assignedToId: "emp-2", dueDate: soon, subtasks: [], createdAt: "2026-09-04T00:00:00.000Z" },
];

function renderWidget() {
  return render(
    <MemoryRouter>
      <TeamServicesWidget />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  serviceApi.listServices.mockResolvedValue({ data: { data: TEAM_OPEN } });
  userDirectoryApi.fetchUserDropdown.mockResolvedValue({
    data: { data: [{ _id: "mgr-1", name: "Priya Manager" }, { _id: "emp-1", name: "Ramesh" }, { _id: "emp-2", name: "Sunita" }] },
  });
  useSessionStore.setState({
    user: { _id: "mgr-1", role: "manager", permissions: { services: { view: true, create: true, edit: true, delete: true } } },
    isAuthenticated: true,
    isLoading: false,
  });
});

describe("TeamServicesWidget", () => {
  it("groups open items by assignee, most urgent group first, flags overdue, and labels the viewer's own as You", async () => {
    renderWidget();

    await screen.findByText("Sunita overdue");
    expect(serviceApi.listServices).toHaveBeenCalledWith({ status: "todo" });
    expect(screen.getByText("Team Services · 4 open")).toBeInTheDocument();
    expect(screen.getByText("1 overdue")).toBeInTheDocument();

    // Groups render in urgency order: Sunita (has the overdue), then the
    // manager's own (due soon), then Ramesh (undated).
    const groups = ["emp-2", "mgr-1", "emp-1"].map((id) => screen.getByTestId(`team-services-${id}`));
    const order = groups.map((group) => group.getBoundingClientRect ? group : group);
    expect(order.map((g) => g.getAttribute("data-testid"))).toEqual(["team-services-emp-2", "team-services-mgr-1", "team-services-emp-1"]);

    const sunita = screen.getByTestId("team-services-emp-2");
    await within(sunita).findByText("Sunita");
    expect(within(sunita).getByText("· 2")).toBeInTheDocument();
    expect(within(sunita).getByText("Sunita overdue")).toHaveClass("text-red-600");
    expect(within(sunita).getByText(/overdue/i, { selector: "span.shrink-0" })).toBeInTheDocument();

    const mine = screen.getByTestId("team-services-mgr-1");
    expect(within(mine).getByText("You")).toBeInTheDocument();
    expect(within(mine).getByText("Manager's own")).toBeInTheDocument();

    expect(screen.getByRole("link", { name: /All services/ })).toHaveAttribute("href", "/services");
  });

  it("renders what the server sent — it applies no scoping of its own", async () => {
    // An admin's list includes everyone; the same component just shows more groups.
    useSessionStore.setState({ user: { _id: "admin-1", role: "admin", permissions: {} }, isAuthenticated: true, isLoading: false });
    renderWidget();

    await screen.findByText("Sunita overdue");
    expect(screen.getByText("All Services · 4 open")).toBeInTheDocument();
    expect(screen.getAllByTestId(/team-services-/)).toHaveLength(3);
  });

  it("shows the empty state with no open work", async () => {
    serviceApi.listServices.mockResolvedValue({ data: { data: [] } });
    renderWidget();

    expect(await screen.findByText("No open services")).toBeInTheDocument();
  });

  it("renders nothing for a user without services.view", () => {
    useSessionStore.setState({ user: { _id: "mgr-2", role: "manager", permissions: {} }, isAuthenticated: true, isLoading: false });
    const { container } = renderWidget();

    expect(container).toBeEmptyDOMElement();
    expect(serviceApi.listServices).not.toHaveBeenCalled();
  });
});
