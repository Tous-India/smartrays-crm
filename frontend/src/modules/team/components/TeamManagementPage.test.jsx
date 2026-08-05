import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { message } from "antd";
import TeamManagementPage from "./TeamManagementPage";
import * as teamApi from "../api/teamApi";
import useSessionStore from "../../../store/sessionStore";

// Same pattern as UserManagementPage.test.jsx — antd's `message` toast is
// portal-rendered outside RTL's reach under jsdom, so the mock function call
// is asserted directly instead of DOM text.
vi.mock("antd", async (importOriginal) => {
  const actual = await importOriginal();
  // Components read `message` via `App.useApp()` (§7.28 message-rendering
  // fix — the static import silently fails to render under React 19), not
  // the static export, so the mock has to intercept the hook too.
  const mockMessage = { success: vi.fn(), error: vi.fn() };
  actual.App.useApp = () => ({ message: mockMessage });
  return { ...actual, message: mockMessage };
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
  getTeamTypes: vi.fn(),
}));

const SAMPLE_TEAM_TYPES = [
  { _id: "type-1", name: "Sales", isActive: true },
  { _id: "type-2", name: "Installation", isActive: true },
  { _id: "type-3", name: "Technical", isActive: true },
];

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
    // This whole block covers the `teams.manage` (admin) tier — the
    // read-only `teams.view_team` tier has its own describe block below.
    useSessionStore.setState({
      user: { _id: "admin-1", role: "admin", permissions: {} },
      isAuthenticated: true,
      isLoading: false,
    });
    teamApi.listTeams.mockResolvedValue({ data: { data: SAMPLE_TEAMS } });
    teamApi.getTeamMembers.mockResolvedValue({ data: { data: [] } });
    teamApi.getTeamTypes.mockResolvedValue({ data: { data: SAMPLE_TEAM_TYPES } });
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

  describe("Type dropdown (§7.30, 2026-07-31 — admin-managed list, not free text)", () => {
    it("the create form's Type field is a dropdown populated from GET /team-types", async () => {
      renderPage();
      await screen.findByText("North Sales Team");

      await userEvent.click(screen.getByRole("button", { name: /Create Team/ }));
      const dialog = await screen.findByRole("dialog", { name: "Create Team" });

      fireEvent.mouseDown(within(dialog).getByText("Select a type (optional)"));

      expect(await screen.findByTitle("Sales")).toBeInTheDocument();
      expect(screen.getByTitle("Installation")).toBeInTheDocument();
      expect(screen.getByTitle("Technical")).toBeInTheDocument();
    });

    it("excludes a deactivated team type from the create form's dropdown", async () => {
      teamApi.getTeamTypes.mockResolvedValue({
        data: { data: [...SAMPLE_TEAM_TYPES, { _id: "type-4", name: "Retired Type", isActive: false }] },
      });
      renderPage();
      await screen.findByText("North Sales Team");

      await userEvent.click(screen.getByRole("button", { name: /Create Team/ }));
      const dialog = await screen.findByRole("dialog", { name: "Create Team" });
      fireEvent.mouseDown(within(dialog).getByText("Select a type (optional)"));

      await screen.findByTitle("Sales");
      expect(screen.queryByTitle("Retired Type")).not.toBeInTheDocument();
    });

    it("the edit form still shows a legacy team's now-deactivated type, labeled inactive, rather than blanking it", async () => {
      teamApi.getTeamTypes.mockResolvedValue({
        data: { data: [{ _id: "type-9", name: "Sales", isActive: false }] },
      });
      renderPage();
      await screen.findByText("North Sales Team");

      await userEvent.click(screen.getByRole("button", { name: "Edit team" }));
      const dialog = await screen.findByRole("dialog", { name: "Edit Team" });

      expect(await within(dialog).findByText("Sales (inactive)")).toBeInTheDocument();
    });

    it("selecting a type on create submits its name in the payload", async () => {
      teamApi.createTeam.mockResolvedValue({ data: {} });
      renderPage();
      await screen.findByText("North Sales Team");

      await userEvent.click(screen.getByRole("button", { name: /Create Team/ }));
      const dialog = await screen.findByRole("dialog", { name: "Create Team" });

      await userEvent.type(within(dialog).getByLabelText("Name"), "Install Team");
      fireEvent.mouseDown(within(dialog).getByText("Select a type (optional)"));
      await userEvent.click(await screen.findByTitle("Installation"));
      fireEvent.mouseDown(within(dialog).getByText("Select a manager or admin"));
      await userEvent.click((await screen.findAllByText("Manager One")).at(-1));

      await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

      await waitFor(() => {
        expect(teamApi.createTeam).toHaveBeenCalledWith(
          expect.objectContaining({ type: "Installation" })
        );
      });
    });
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

  it("shows the accurate member count in the delete confirmation before the admin confirms (§7.28)", async () => {
    renderPage();
    await screen.findByText("North Sales Team");

    await userEvent.click(screen.getByRole("button", { name: "Delete team" }));

    expect(
      await screen.findByText(
        "This team has 1 member. Deleting it will not remove them, but they'll lose this team grouping. Continue?"
      )
    ).toBeInTheDocument();
  });

  it("shows a zero-member message in the delete confirmation for an empty team", async () => {
    teamApi.listTeams.mockResolvedValue({
      data: { data: [{ ...SAMPLE_TEAMS[0], memberCount: 0 }] },
    });
    renderPage();
    await screen.findByText("North Sales Team");

    await userEvent.click(screen.getByRole("button", { name: "Delete team" }));

    expect(await screen.findByText("This team has no members. Continue?")).toBeInTheDocument();
  });

  describe("Filters (§7.28)", () => {
    it("refetches with the selected type", async () => {
      renderPage();
      await screen.findByText("North Sales Team");

      fireEvent.mouseDown(screen.getByText("All Types"));
      await userEvent.click(await screen.findByTitle("Sales"));

      await waitFor(() => {
        expect(teamApi.listTeams).toHaveBeenCalledWith(expect.objectContaining({ type: "Sales" }));
      });
    });

    it("refetches with the selected active/inactive status", async () => {
      renderPage();
      await screen.findByText("North Sales Team");

      fireEvent.mouseDown(screen.getByText("Active or Inactive"));
      await userEvent.click(await screen.findByTitle("Inactive"));

      await waitFor(() => {
        expect(teamApi.listTeams).toHaveBeenCalledWith(expect.objectContaining({ isActive: "false" }));
      });
    });
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

/**
 * `teams.view_team` (2026-08-05) — a manager reads the team they head. Same
 * page, same table, no writes. The backend scopes `GET /teams` to their own
 * team, so the list arrives already narrowed; this block covers what the UI
 * does with that.
 */
describe("TeamManagementPage — read-only for the teams.view_team tier", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSessionStore.setState({
      user: { _id: "mgr-1", role: "manager", permissions: { teams: { view_team: true } } },
      isAuthenticated: true,
      isLoading: false,
    });
    teamApi.listTeams.mockResolvedValue({ data: { data: SAMPLE_TEAMS } });
    teamApi.getTeamMembers.mockResolvedValue({ data: { data: [{ _id: "emp-1", name: "Employee One", role: "employee" }] } });
    teamApi.getTeamTypes.mockResolvedValue({ data: { data: SAMPLE_TEAM_TYPES } });
  });

  it("still shows the team list itself", async () => {
    renderPage();

    expect(await screen.findByText("North Sales Team")).toBeInTheDocument();
    expect(screen.getByText("Manager One")).toBeInTheDocument();
  });

  it("offers no Create, Edit, or Delete affordance anywhere", async () => {
    renderPage();
    await screen.findByText("North Sales Team");

    expect(screen.queryByRole("button", { name: /Create Team/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit team" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete team" })).not.toBeInTheDocument();
  });

  it("can open the members list, but it is view-only — no add picker, no remove button", async () => {
    renderPage();
    await screen.findByText("North Sales Team");

    await userEvent.click(screen.getByRole("button", { name: "View members" }));

    const dialog = await screen.findByRole("dialog", { name: "North Sales Team — Members" });
    expect(within(dialog).getByText("Employee One")).toBeInTheDocument();
    expect(within(dialog).queryByText("Select an employee or sales associate to add")).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Remove member" })).not.toBeInTheDocument();
  });
});
