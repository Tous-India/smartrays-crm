import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import dayjs from "dayjs";
import MyServicesWidget from "./MyServicesWidget";
import useSessionStore from "../../../store/sessionStore";
import * as serviceApi from "../../service/api/serviceApi";

vi.mock("antd", async (importOriginal) => {
  const actual = await importOriginal();
  const mockMessage = { success: vi.fn(), error: vi.fn() };
  actual.App.useApp = () => ({ message: mockMessage });
  return { ...actual, message: mockMessage };
});

vi.mock("../../service/api/serviceApi", () => ({
  listServices: vi.fn(),
  changeServiceStatus: vi.fn(),
  toggleSubtask: vi.fn(),
}));

const yesterday = dayjs().subtract(1, "day").toISOString();
const inThreeDays = dayjs().add(3, "day").toISOString();
const nextWeek = dayjs().add(7, "day").toISOString();

const OPEN = [
  { _id: "s-undated", title: "Undated one", status: "todo", assignedToId: "emp-1", dueDate: null, subtasks: [], createdAt: "2026-09-01T00:00:00.000Z" },
  { _id: "s-week", title: "Due next week", status: "todo", assignedToId: "emp-1", dueDate: nextWeek, subtasks: [], createdAt: "2026-09-02T00:00:00.000Z" },
  { _id: "s-overdue", title: "Overdue one", status: "todo", assignedToId: "emp-1", dueDate: yesterday, subtasks: [{ _id: "sa", title: "a", isDone: true }, { _id: "sb", title: "b", isDone: false }], createdAt: "2026-09-03T00:00:00.000Z" },
  { _id: "s-soon", title: "Due soon", status: "todo", assignedToId: "emp-1", dueDate: inThreeDays, subtasks: [], createdAt: "2026-09-04T00:00:00.000Z" },
];

function renderWidget() {
  return render(
    <MemoryRouter>
      <MyServicesWidget />
    </MemoryRouter>
  );
}

const EMPLOYEE = { _id: "emp-1", role: "employee", permissions: { services: { view: true } } };

beforeEach(() => {
  vi.clearAllMocks();
  serviceApi.listServices.mockResolvedValue({ data: { data: OPEN } });
  serviceApi.changeServiceStatus.mockResolvedValue({ data: { data: {} } });
  useSessionStore.setState({ user: EMPLOYEE, isAuthenticated: true, isLoading: false });
});

describe("MyServicesWidget", () => {
  it("asks only for open items and orders them overdue → due soonest → undated, with the count in the header", async () => {
    renderWidget();

    await screen.findByText("Overdue one");
    expect(serviceApi.listServices).toHaveBeenCalledWith({ status: "todo" });

    // AntD renders the action buttons in their own <li>s too, so select the
    // item rows by test id rather than by role.
    const titles = screen.getAllByTestId(/^my-service-/).map((item) => within(item).getByText(/one|week|soon/).textContent);
    expect(titles).toEqual(["Overdue one", "Due soon", "Due next week", "Undated one"]);

    expect(screen.getByText("My Services · 4 open")).toBeInTheDocument();
    expect(screen.getByText(/Overdue ·/)).toBeInTheDocument();
    expect(screen.getByText("1/2 subtasks")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /All my services/ })).toHaveAttribute("href", "/services");
  });

  it("marks an item complete inline through the status endpoint and drops it from the list", async () => {
    renderWidget();
    await screen.findByText("Overdue one");

    await userEvent.click(screen.getByRole("button", { name: "Mark complete: Overdue one" }));

    await waitFor(() => expect(serviceApi.changeServiceStatus).toHaveBeenCalledWith("s-overdue", "completed"));
    await waitFor(() => expect(screen.queryByText("Overdue one")).not.toBeInTheDocument());
    expect(screen.getByText("My Services · 3 open")).toBeInTheDocument();
  });

  it("shows the empty state when nothing is assigned", async () => {
    serviceApi.listServices.mockResolvedValue({ data: { data: [] } });
    renderWidget();

    expect(await screen.findByText("Nothing assigned to you")).toBeInTheDocument();
  });

  it("renders NOTHING — not an error — for a user without services.view", () => {
    useSessionStore.setState({ user: { _id: "emp-2", role: "employee", permissions: {} }, isAuthenticated: true, isLoading: false });
    const { container } = renderWidget();

    expect(container).toBeEmptyDOMElement();
    expect(serviceApi.listServices).not.toHaveBeenCalled();
  });
});

describe("MyServicesWidget — subtasks (§7.72)", () => {
  it("expands inline, ticks through the API, and the count updates live from the response", async () => {
    const overdue = OPEN.find((service) => service._id === "s-overdue");
    serviceApi.toggleSubtask.mockResolvedValue({
      data: { data: { ...overdue, subtasks: [{ ...overdue.subtasks[0] }, { ...overdue.subtasks[1], isDone: true }] } },
    });
    renderWidget();
    const row = await screen.findByTestId("my-service-s-overdue");

    await userEvent.click(within(row).getByRole("button", { name: /1\/2 subtasks/ }));
    const box = within(row).getByRole("checkbox", { name: "b" });
    expect(box).not.toBeChecked();

    await userEvent.click(box);

    await waitFor(() => expect(serviceApi.toggleSubtask).toHaveBeenCalledWith("s-overdue", "sb", true));
    // Live: the row re-renders from the server's copy — 2/2 now, list still open, box ticked.
    expect(await within(row).findByRole("button", { name: /2\/2 subtasks/ })).toBeInTheDocument();
    expect(within(row).getByRole("checkbox", { name: "b" })).toBeChecked();
    expect(serviceApi.listServices).toHaveBeenCalledTimes(1);
  });

  it("rows without subtasks show no expand affordance", async () => {
    renderWidget();
    const row = await screen.findByTestId("my-service-s-undated");

    expect(within(row).queryByRole("button", { name: /subtasks/ })).not.toBeInTheDocument();
  });
});
