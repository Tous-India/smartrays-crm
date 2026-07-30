import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { message } from "antd";
import TeamManagementPage from "./TeamManagementPage";
import * as teamApi from "../api/teamApi";

// Same pattern as UserManagementPage.test.jsx — antd's `message` toast is
// portal-rendered outside RTL's reach under jsdom, so the mock function call
// is asserted directly instead of DOM text.
vi.mock("antd", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, message: { success: vi.fn(), error: vi.fn() } };
});

vi.mock("../api/teamApi", () => ({
  listTeams: vi.fn(),
  getTeam: vi.fn(),
  createTeam: vi.fn(),
  updateTeam: vi.fn(),
  deleteTeam: vi.fn(),
  getTeamMembers: vi.fn(),
  addTeamMember: vi.fn(),
  removeTeamMember: vi.fn(),
}));

vi.mock("../../../hooks/useUserDirectory", () => ({
  useUserDirectory: () => ({ users: SAMPLE_USERS, isLoading: false }),
  default: () => ({ users: SAMPLE_USERS, isLoading: false }),
}));

const SAMPLE_USERS = [
  { _id: "mgr-1", name: "Manager One", role: "manager" },
  { _id: "emp-1", name: "Employee One", role: "employee" },
];

const SAMPLE_TEAMS = [
  {
    _id: "team-1",
    name: "North Sales Team",
    type: "Sales",
    headManagerId: "mgr-1",
    memberCount: 1,
    isActive: true,
  },
];

function renderPage() {
  return render(<TeamManagementPage />);
}

describe("TeamManagementPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    teamApi.listTeams.mockResolvedValue({ data: { data: SAMPLE_TEAMS } });
    teamApi.getTeamMembers.mockResolvedValue({ data: { data: [] } });
  });

  it("renders the team list with name/type/head/member count/status", async () => {
    renderPage();

    expect(await screen.findByText("North Sales Team")).toBeInTheDocument();
    const row = screen.getByText("North Sales Team").closest("tr");
    expect(within(row).getByText("Sales")).toBeInTheDocument();
    expect(within(row).getByText("Manager One")).toBeInTheDocument();
    expect(within(row).getByText("1")).toBeInTheDocument();
    expect(within(row).getByText("Active")).toBeInTheDocument();
  });

  it("opens the create team modal", async () => {
    renderPage();
    await screen.findByText("North Sales Team");

    await userEvent.click(screen.getByRole("button", { name: /Create Team/ }));

    expect(screen.getByRole("dialog", { name: "Create Team" })).toBeInTheDocument();
  });

  it("opens the edit team modal pre-filled with the row's values", async () => {
    renderPage();
    await screen.findByText("North Sales Team");

    await userEvent.click(screen.getByRole("button", { name: "Edit team" }));

    const dialog = await screen.findByRole("dialog", { name: "Edit Team" });
    expect(within(dialog).getByDisplayValue("North Sales Team")).toBeInTheDocument();
  });

  it("deletes a team after confirming", async () => {
    teamApi.deleteTeam.mockResolvedValue({ data: {} });
    renderPage();
    await screen.findByText("North Sales Team");

    await userEvent.click(screen.getByRole("button", { name: "Delete team" }));
    await userEvent.click(await screen.findByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(teamApi.deleteTeam).toHaveBeenCalledWith("team-1");
    });
    expect(message.success).toHaveBeenCalledWith("Team deleted");
  });

  it("opens the members modal and adds a member", async () => {
    teamApi.addTeamMember.mockResolvedValue({ data: {} });
    renderPage();
    await screen.findByText("North Sales Team");

    await userEvent.click(screen.getByRole("button", { name: "Manage members" }));

    const dialog = await screen.findByRole("dialog", { name: "North Sales Team — Members" });
    fireEvent.mouseDown(within(dialog).getByText("Select an employee or sales associate to add"));
    await userEvent.click(await screen.findByText("Employee One"));
    await userEvent.click(within(dialog).getByRole("button", { name: "Add" }));

    const confirmButtons = await screen.findAllByRole("button", { name: "Add" });
    await userEvent.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => {
      expect(teamApi.addTeamMember).toHaveBeenCalledWith("team-1", "emp-1");
    });
    expect(message.success).toHaveBeenCalledWith("Member added");
  });
});
