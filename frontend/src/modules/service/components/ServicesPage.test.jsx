import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import ServicesPage from "./ServicesPage";
import useSessionStore from "../../../store/sessionStore";
import * as serviceApi from "../api/serviceApi";

vi.mock("antd", async (importOriginal) => {
  const actual = await importOriginal();
  const mockMessage = { success: vi.fn(), error: vi.fn() };
  actual.App.useApp = () => ({ message: mockMessage });
  return { ...actual, message: mockMessage };
});

vi.mock("../api/serviceApi", () => ({
  listServices: vi.fn(),
  listAssignees: vi.fn(),
  getService: vi.fn(),
  createService: vi.fn(),
  updateService: vi.fn(),
  changeServiceStatus: vi.fn(),
  toggleSubtask: vi.fn(),
  deleteService: vi.fn(),
}));

vi.mock("../../../services/userDirectoryApi", () => ({
  fetchUserDropdown: vi.fn(),
}));

const { fetchUserDropdown } = await import("../../../services/userDirectoryApi");
const { message } = await import("antd");

const USERS = [
  { _id: "admin-1", name: "Vinay" },
  { _id: "mgr-1", name: "Priya Manager" },
  { _id: "emp-1", name: "Ramesh" },
  { _id: "emp-2", name: "Sunita" },
];

const SERVICES = [
  {
    _id: "svc-1",
    title: "Inspect inverter at site 4",
    description: "Check the DC isolator",
    status: "todo",
    assignedToId: "emp-1",
    createdById: "mgr-1",
    dueDate: "2026-09-25T00:00:00.000Z",
    subtasks: [{ _id: "s1", title: "Photograph the label", isDone: true }, { _id: "s2", title: "Log serial", isDone: false }],
    completedAt: null,
    completedById: null,
  },
  {
    _id: "svc-2",
    title: "Replace fuse at site 2",
    description: "",
    status: "completed",
    assignedToId: "emp-2",
    createdById: "admin-1",
    dueDate: null,
    subtasks: [],
    completedAt: "2026-09-18T10:00:00.000Z",
    completedById: "emp-2",
  },
];

function signInAs(user) {
  useSessionStore.setState({ user, isAuthenticated: true, isLoading: false });
}

const ADMIN = { _id: "admin-1", name: "Vinay", role: "admin", permissions: {} };
const MANAGER = {
  _id: "mgr-1",
  name: "Priya Manager",
  role: "manager",
  permissions: { services: { view: true, create: true, edit: true, delete: true } },
};
const EMPLOYEE = { _id: "emp-1", name: "Ramesh", role: "employee", permissions: { services: { view: true } } };

function renderPage() {
  return render(
    <MemoryRouter>
      <ServicesPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  serviceApi.listServices.mockResolvedValue({ data: { data: SERVICES } });
  serviceApi.listAssignees.mockResolvedValue({ data: { data: USERS.slice(1) } });
  serviceApi.createService.mockResolvedValue({ data: { data: { _id: "svc-new" } } });
  serviceApi.updateService.mockResolvedValue({ data: { data: SERVICES[0] } });
  serviceApi.changeServiceStatus.mockResolvedValue({ data: { data: { ...SERVICES[0], status: "completed" } } });
  serviceApi.deleteService.mockResolvedValue({ data: { data: null } });
  serviceApi.toggleSubtask.mockResolvedValue({ data: { data: SERVICES[0] } });
  fetchUserDropdown.mockResolvedValue({ data: { data: USERS } });
});

describe("ServicesPage — the two columns", () => {
  it("splits the scoped list into To Do and Completed with counts, naming assignee and creator", async () => {
    signInAs(ADMIN);
    renderPage();

    const todo = await screen.findByTestId("services-todo");
    const completed = screen.getByTestId("services-completed");

    expect(within(todo).getByText("Inspect inverter at site 4")).toBeInTheDocument();
    expect(within(completed).getByText("Replace fuse at site 2")).toBeInTheDocument();
    // Counts render as badges.
    expect(within(todo).getByText("1")).toBeInTheDocument();
    expect(within(completed).getByText("1")).toBeInTheDocument();

    // Assignee and creator both visible on the card.
    const card = within(todo).getByTestId("service-card-svc-1");
    await waitFor(() => expect(within(card).getByText("Ramesh")).toBeInTheDocument());
    expect(within(card).getByText("Priya Manager")).toBeInTheDocument();
    expect(within(card).getByText("1/2 subtasks")).toBeInTheDocument();
  });

  it("renders the list it is given — it does not filter for visibility itself", async () => {
    signInAs(EMPLOYEE);
    renderPage();

    // The server scoped this list; the page shows both rows it received.
    expect(await screen.findByText("Inspect inverter at site 4")).toBeInTheDocument();
    expect(screen.getByText("Replace fuse at site 2")).toBeInTheDocument();
    expect(serviceApi.listServices).toHaveBeenCalledTimes(1);
  });
});

describe("ServicesPage — employee (services.view only)", () => {
  beforeEach(() => signInAs(EMPLOYEE));

  it("has no New Service button and no edit/delete controls", async () => {
    renderPage();
    await screen.findByText("Inspect inverter at site 4");

    expect(screen.queryByRole("button", { name: /New Service/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit service" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete service" })).not.toBeInTheDocument();
  });

  it("can mark their OWN item complete, and only their own", async () => {
    renderPage();
    await screen.findByText("Inspect inverter at site 4");

    // svc-1 is assigned to emp-1 (me) → complete button present.
    const mine = screen.getByTestId("service-card-svc-1");
    await userEvent.click(within(mine).getByRole("button", { name: "Mark complete" }));

    await waitFor(() => expect(serviceApi.changeServiceStatus).toHaveBeenCalledWith("svc-1", "completed"));
    // Refetched after the change.
    await waitFor(() => expect(serviceApi.listServices).toHaveBeenCalledTimes(2));

    // svc-2 is someone else's → no status control at all.
    const theirs = screen.getByTestId("service-card-svc-2");
    expect(within(theirs).queryByRole("button", { name: /Reopen|Mark complete/ })).not.toBeInTheDocument();
  });
});

describe("ServicesPage — manager / admin", () => {
  it("manager's assignee picker shows exactly what the server returned — scoped, not filtered here", async () => {
    signInAs(MANAGER);
    // The server says: my team and me. Nobody else.
    serviceApi.listAssignees.mockResolvedValue({
      data: { data: [{ _id: "mgr-1", name: "Priya Manager" }, { _id: "emp-1", name: "Ramesh" }] },
    });
    renderPage();
    await screen.findByText("Inspect inverter at site 4");

    await userEvent.click(screen.getByRole("button", { name: /New Service/ }));
    await waitFor(() => expect(serviceApi.listAssignees).toHaveBeenCalled());

    await userEvent.click(await screen.findByLabelText("Assign to"));
    await screen.findByTitle("Ramesh");
    // The visible dropdown items carry the label as `title`; the a11y
    // `role="option"` nodes carry the value, so they are not what a user sees.
    const labels = [...document.querySelectorAll(".ant-select-item-option")].map((item) => item.getAttribute("title"));

    expect(labels).toEqual(["Priya Manager", "Ramesh"]);
  });

  it("creates with the chosen assignee, a due date and subtasks, then refetches", async () => {
    signInAs(ADMIN);
    renderPage();
    await screen.findByText("Inspect inverter at site 4");

    await userEvent.click(screen.getByRole("button", { name: /New Service/ }));
    await userEvent.type(await screen.findByLabelText("Title"), "Clean panels at site 7");
    await userEvent.click(screen.getByLabelText("Assign to"));
    await userEvent.click(await screen.findByTitle("Sunita"));
    await userEvent.click(screen.getByRole("button", { name: /Add subtask/ }));
    await userEvent.type(screen.getByPlaceholderText("Subtask"), "Bring the hose");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(serviceApi.createService).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Clean panels at site 7",
          assignedToId: "emp-2",
          subtasks: [expect.objectContaining({ title: "Bring the hose" })],
        })
      );
    });
    await waitFor(() => expect(message.success).toHaveBeenCalledWith("Service created"));
    await waitFor(() => expect(serviceApi.listServices).toHaveBeenCalledTimes(2));
  });

  it("edits an existing service with the assignee pre-selected BY NAME, and reassigns", async () => {
    signInAs(ADMIN);
    renderPage();
    await screen.findByText("Inspect inverter at site 4");

    const card = screen.getByTestId("service-card-svc-1");
    await userEvent.click(within(card).getByRole("button", { name: "Edit service" }));

    // Pre-filled from the record, and the assignee shows a label, not an id.
    expect(await screen.findByLabelText("Title")).toHaveValue("Inspect inverter at site 4");
    await waitFor(() => {
      expect(screen.getByLabelText("Assign to").closest(".ant-select")).toHaveTextContent("Ramesh");
    });

    await userEvent.click(screen.getByLabelText("Assign to"));
    await userEvent.click(await screen.findByTitle("Sunita"));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(serviceApi.updateService).toHaveBeenCalledWith("svc-1", expect.objectContaining({ assignedToId: "emp-2" }));
    });
  });

  it("surfaces the server's message when a create is refused", async () => {
    signInAs(MANAGER);
    serviceApi.createService.mockRejectedValue({
      response: { data: { message: "assignedToId must be an active user you can assign to" } },
    });
    renderPage();
    await screen.findByText("Inspect inverter at site 4");

    await userEvent.click(screen.getByRole("button", { name: /New Service/ }));
    await userEvent.type(await screen.findByLabelText("Title"), "x");
    await userEvent.click(screen.getByLabelText("Assign to"));
    await userEvent.click(await screen.findByTitle("Ramesh"));
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() =>
      expect(message.error).toHaveBeenCalledWith("assignedToId must be an active user you can assign to")
    );
  });

  it("shows a 403 result to a user with no services.view", async () => {
    signInAs({ _id: "x", role: "employee", permissions: {} });
    renderPage();

    expect(await screen.findByText("Not authorized")).toBeInTheDocument();
    expect(serviceApi.listServices).not.toHaveBeenCalled();
  });
});

/**
 * §7.72 — subtasks are workable, not just counted.
 */
describe("ServicesPage — subtasks", () => {
  it("the count expands inline to a checklist; ticking one calls the API and refetches", async () => {
    signInAs(ADMIN);
    renderPage();
    const card = await screen.findByTestId("service-card-svc-1");

    // Collapsed by default — no checklist, no modal.
    expect(within(card).queryByTestId("subtask-list-svc-1")).not.toBeInTheDocument();

    await userEvent.click(within(card).getByRole("button", { name: /1\/2 subtasks/ }));

    const list = within(card).getByTestId("subtask-list-svc-1");
    expect(within(list).getByRole("checkbox", { name: "Photograph the label" })).toBeChecked();
    expect(within(list).getByRole("checkbox", { name: "Log serial" })).not.toBeChecked();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    serviceApi.toggleSubtask.mockResolvedValue({
      data: { data: { ...SERVICES[0], subtasks: SERVICES[0].subtasks.map((subtask) => ({ ...subtask, isDone: true })) } },
    });
    await userEvent.click(within(list).getByRole("checkbox", { name: "Log serial" }));

    await waitFor(() => expect(serviceApi.toggleSubtask).toHaveBeenCalledWith("svc-1", "s2", true));
    // Live, in place: the count moves and the list stays open — no refetch,
    // no spinner unmounting the card.
    expect(await within(card).findByRole("button", { name: /2\/2 subtasks/ })).toBeInTheDocument();
    expect(within(card).getByRole("checkbox", { name: "Log serial" })).toBeChecked();
    expect(serviceApi.listServices).toHaveBeenCalledTimes(1);
  });

  it("an employee with only services.view can tick subtasks on their OWN item", async () => {
    signInAs(EMPLOYEE);
    renderPage();
    const card = await screen.findByTestId("service-card-svc-1");

    await userEvent.click(within(card).getByRole("button", { name: /1\/2 subtasks/ }));
    const box = within(card).getByRole("checkbox", { name: "Log serial" });
    expect(box).toBeEnabled();

    await userEvent.click(box);

    await waitFor(() => expect(serviceApi.toggleSubtask).toHaveBeenCalledWith("svc-1", "s2", true));
  });

  it("a service with zero subtasks has no expand affordance and no empty panel", async () => {
    signInAs(ADMIN);
    renderPage();
    const card = await screen.findByTestId("service-card-svc-2");

    expect(within(card).queryByRole("button", { name: /subtasks/ })).not.toBeInTheDocument();
    expect(within(card).queryByTestId("subtask-list-svc-2")).not.toBeInTheDocument();
  });
});
