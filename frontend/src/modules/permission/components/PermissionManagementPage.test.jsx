import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { message } from "antd";
import PermissionManagementPage from "./PermissionManagementPage";
import useSessionStore from "../../../store/sessionStore";
import * as permissionApi from "../api/permissionApi";

// `useSearchParams` (added 2026-07-31, §7.32 — the `?userId=` deep-link)
// needs a Router context that wasn't required here before.
function renderPage(initialEntries = ["/settings/permissions"]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <PermissionManagementPage />
    </MemoryRouter>
  );
}

vi.mock("antd", async (importOriginal) => {
  const actual = await importOriginal();
  // Components read `message` via `App.useApp()` (§7.28 message-rendering
  // fix — the static import silently fails to render under React 19), not
  // the static export, so the mock has to intercept the hook too. `modal` is
  // intercepted the same way for the §7.41 self-lockout confirmation.
  const mockMessage = { success: vi.fn(), error: vi.fn() };
  const mockModal = { confirm: vi.fn() };
  actual.App.useApp = () => ({ message: mockMessage, modal: mockModal });
  return { ...actual, message: mockMessage, __mockModal: mockModal };
});

const { __mockModal: mockModal } = await import("antd");

vi.mock("../api/permissionApi", () => ({
  getPermissionRegistry: vi.fn(),
  getRoleTemplate: vi.fn(),
  updateRoleTemplate: vi.fn(),
  getUserPermissions: vi.fn(),
  updateUserPermissions: vi.fn(),
  resetUserPermissions: vi.fn(),
}));

vi.mock("../../../services/userDirectoryApi", () => ({
  fetchUserDropdown: vi.fn().mockResolvedValue({
    data: {
      data: [
        { _id: "user-1", name: "Manager One", role: "manager" },
        { _id: "user-2", name: "Sales One", role: "sales_associate" },
        // Included specifically so the User Overrides tab's own exclusion
        // filter (2026-07-31 fix) is what's actually proven, not just an
        // absent admin in the fixture data making the assertion vacuous.
        { _id: "admin-1", name: "Site Admin", role: "admin" },
      ],
    },
  }),
}));

/**
 * A cut-down but structurally faithful registry: one full CRUD module, one
 * scoped module with capability flags, one capability-only module, and one
 * ownership-scoped module. Between them these cover every row shape the real
 * registry produces.
 */
const REGISTRY = {
  leads: ["view", "create", "edit", "delete"],
  leave: ["view", "view_team", "view_all", "approve", "delete"],
  permissions: ["manage"],
  payments: ["view", "create"],
};

// leads sits exactly on the Edit rung (view+create+edit), matching how the
// real manager template is actually shaped. A partial ladder here would make
// every test start life with unsaved changes on load.
const MANAGER_TEMPLATE = {
  role: "manager",
  permissions: { leads: { view: true, create: true, edit: true } },
  updatedBy: "user-1",
  updatedAt: "2026-07-01T00:00:00.000Z",
};

/**
 * AntD keeps an inactive tab pane mounted, so both tabs' matrices can be in
 * the document at once and a bare getByTestId finds two of everything. Every
 * query after switching tabs is scoped to the ACTIVE pane.
 */
function activePane() {
  return document.querySelector(".ant-tabs-tabpane-active");
}

/** Opens User Overrides and selects Manager One. */
async function openUserOverrides() {
  await userEvent.click(screen.getByRole("tab", { name: "Individual User Overrides" }));
  await waitFor(() => expect(screen.getByText("Select a user")).toBeVisible());
  // AntD's Select placeholder span has `pointer-events: none` by design
  // (clicks pass through to the underlying search input), so a plain
  // userEvent.click on it fails userEvent's pointer-events safety check —
  // fireEvent.mouseDown bypasses that and is what actually opens the
  // dropdown, same fix already established for the Team module's own member
  // picker test.
  fireEvent.mouseDown(screen.getByText("Select a user"));
  await userEvent.click(await screen.findByTitle("Manager One (Manager)"));
}

/** The row for a module, within the active tab pane. */
function row(moduleName) {
  return within(activePane()).getByTestId(`permission-row-${moduleName}`);
}

async function findRow(moduleName) {
  return within(activePane()).findByTestId(`permission-row-${moduleName}`);
}

/** Clicks a level on a module's segmented control. */
async function setLevel(moduleName, label) {
  await userEvent.click(within(row(moduleName)).getByText(label));
}

/** The Save button of the active pane. */
function saveButton() {
  return within(activePane()).getByRole("button", { name: "Save" });
}

describe("PermissionManagementPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSessionStore.setState({ user: { _id: "admin-1", role: "admin" } });
    permissionApi.getPermissionRegistry.mockResolvedValue({ data: { data: REGISTRY } });
    permissionApi.getRoleTemplate.mockResolvedValue({ data: { data: MANAGER_TEMPLATE } });
  });

  it("renders one row per registry module, labelled for humans", async () => {
    renderPage();

    expect(await screen.findByTestId("permission-row-leads")).toBeInTheDocument();
    expect(screen.getByTestId("permission-row-leave")).toBeInTheDocument();
    expect(screen.getByTestId("permission-row-payments")).toBeInTheDocument();
    expect(screen.getByText("Leads")).toBeInTheDocument();
  });

  /**
   * The layout invariant, stated as behaviour rather than pixels: a module
   * gaining permission keys must change what a level maps to, never the
   * number of controls. jsdom performs no layout, so `scrollWidth` there is
   * always 0 and a bare `scrollWidth === clientWidth` assertion would pass
   * vacuously — the real pixel measurement at 1280/1024/390 is done in a
   * browser (see docs/project-status.md). This asserts the structural cause.
   */
  describe("layout invariant — adding a key never widens the row", () => {
    it("renders the same two selectors regardless of how many actions a module has", async () => {
      const { unmount } = renderPage();
      await screen.findByTestId("permission-row-leads");
      const before = screen.getByTestId("permission-row-leads").querySelectorAll(".ant-segmented").length;
      unmount();

      permissionApi.getPermissionRegistry.mockResolvedValue({
        data: {
          data: { ...REGISTRY, leads: ["view", "create", "edit", "delete", "assign_team", "run"] },
        },
      });

      renderPage();
      await screen.findByTestId("permission-row-leads");
      const after = screen.getByTestId("permission-row-leads").querySelectorAll(".ant-segmented").length;

      expect(after).toBe(before);
      // The two extra keys became wrapping chips, not new columns.
      expect(
        screen.getByTestId("permission-row-leads").querySelectorAll(".permission-chip")
      ).toHaveLength(2);
    });

    it("keeps every row's structure identical, so nothing can push a column wider", async () => {
      renderPage();
      await screen.findByTestId("permission-row-leads");

      ["leads", "leave", "permissions", "payments"].forEach((moduleName) => {
        const row = screen.getByTestId(`permission-row-${moduleName}`);

        expect(row.querySelector(".permission-row__label")).toBeInTheDocument();
        expect(row.querySelector(".permission-row__level")).toBeInTheDocument();
        expect(row.querySelector(".permission-row__scope")).toBeInTheDocument();
      });
    });
  });

  describe("levels, scope and capability flags", () => {
    it("expands a level to the correct flat key set on save", async () => {
      permissionApi.updateRoleTemplate.mockResolvedValue({ data: { data: MANAGER_TEMPLATE } });

      renderPage();
      await screen.findByTestId("permission-row-leads");

      await setLevel("leads", "Full");
      await userEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => expect(permissionApi.updateRoleTemplate).toHaveBeenCalled());
      const [, sent] = permissionApi.updateRoleTemplate.mock.calls[0];
      expect(sent.leads).toEqual({ view: true, create: true, edit: true, delete: true });
    });

    it("does not offer Edit for a module with no create/edit key", async () => {
      renderPage();
      const row = await screen.findByTestId("permission-row-leave");

      expect(within(row).getByText("View")).toBeInTheDocument();
      expect(within(row).getByText("Full")).toBeInTheDocument();
      expect(within(row).queryByText("Edit")).not.toBeInTheDocument();
    });

    it("maps scope onto the existing view_team / view_all key variants", async () => {
      permissionApi.updateRoleTemplate.mockResolvedValue({ data: { data: MANAGER_TEMPLATE } });

      renderPage();
      await screen.findByTestId("permission-row-leave");

      await setLevel("leave", "View");
      const row = screen.getByTestId("permission-row-leave");
      await userEvent.click(within(row).getByText("Team"));
      await userEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => expect(permissionApi.updateRoleTemplate).toHaveBeenCalled());
      const [, sent] = permissionApi.updateRoleTemplate.mock.calls[0];
      expect(sent.leave).toMatchObject({ view: true, view_team: true, view_all: false });
    });

    it("renders scope inert, with a reason, where it is not a permission key", async () => {
      renderPage();
      await screen.findByTestId("permission-row-leads");

      expect(screen.getByTestId("scope-inert-leads")).toBeInTheDocument();
      expect(screen.getByTestId("scope-inert-payments")).toBeInTheDocument();
    });

    it("round-trips capability flags independently of the level", async () => {
      permissionApi.updateRoleTemplate.mockResolvedValue({ data: { data: MANAGER_TEMPLATE } });

      renderPage();
      await screen.findByTestId("permission-row-leave");

      const row = screen.getByTestId("permission-row-leave");
      await userEvent.click(within(row).getByRole("button", { name: "Approve leave" }));
      await userEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => expect(permissionApi.updateRoleTemplate).toHaveBeenCalled());
      const [, sent] = permissionApi.updateRoleTemplate.mock.calls[0];
      // Granted even though the level is still None — flags are independent.
      expect(sent.leave.approve).toBe(true);
      expect(sent.leave.view).toBe(false);
    });

    it("shows a capability-only module as chips with no graded level", async () => {
      renderPage();
      await screen.findByTestId("permission-row-permissions");

      expect(screen.getByTestId("level-inert-permissions")).toBeInTheDocument();
      expect(
        within(screen.getByTestId("permission-row-permissions")).getByRole("button", {
          name: "Manage permissions",
        })
      ).toBeInTheDocument();
    });
  });

  describe("drift visibility", () => {
    it("marks the changed row with its previous value and counts unsaved changes", async () => {
      renderPage();
      await screen.findByTestId("permission-row-leads");

      expect(screen.getByText("No unsaved changes")).toBeInTheDocument();

      await setLevel("leads", "Full");

      // leads was View·Edit (view+create); Full adds edit and delete.
      expect(screen.getByTestId("row-changed-leads")).toHaveTextContent("was Edit");
      expect(screen.getByText(/unsaved change/)).toBeInTheDocument();
    });

    it("clears the marker when the row is returned to its saved value", async () => {
      renderPage();
      await screen.findByTestId("permission-row-leads");

      await setLevel("leads", "Full");
      expect(screen.getByTestId("row-changed-leads")).toBeInTheDocument();

      await setLevel("leads", "Edit");

      await waitFor(() => expect(screen.queryByTestId("row-changed-leads")).not.toBeInTheDocument());
      expect(screen.getByText("No unsaved changes")).toBeInTheDocument();
    });

    it("disables Save when there is nothing to save", async () => {
      renderPage();
      await screen.findByTestId("permission-row-leads");

      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    });

    it("marks permissions that diverge from the user's role template", async () => {
      permissionApi.getUserPermissions.mockResolvedValue({
        // Template grants leads.view + leads.create; this user has neither
        // create nor the template's shape — a real divergence.
        data: { data: { leads: { view: true } } },
      });

      renderPage();
      await screen.findByTestId("permission-row-leads");
      await openUserOverrides();

      await waitFor(() => expect(permissionApi.getUserPermissions).toHaveBeenCalledWith("user-1"));

      expect(await within(activePane()).findByTestId("row-diverges-leads")).toBeInTheDocument();
      expect(within(activePane()).getByTestId("template-divergence-banner")).toBeInTheDocument();
    });

    it("marks nothing when the user matches their template exactly", async () => {
      permissionApi.getUserPermissions.mockResolvedValue({
        data: { data: { leads: { view: true, create: true, edit: true } } },
      });

      renderPage();
      await screen.findByTestId("permission-row-leads");
      await openUserOverrides();

      await waitFor(() => expect(permissionApi.getUserPermissions).toHaveBeenCalledWith("user-1"));

      expect(within(activePane()).queryByTestId("row-diverges-leads")).not.toBeInTheDocument();
      expect(within(activePane()).queryByTestId("template-divergence-banner")).not.toBeInTheDocument();
    });
  });

  describe("self-lockout guard (§7.41 item 7)", () => {
    it("confirms before removing your OWN permissions.manage", async () => {
      useSessionStore.setState({ user: { _id: "user-1", role: "manager" } });
      permissionApi.getUserPermissions.mockResolvedValue({
        data: { data: { permissions: { manage: true } } },
      });

      renderPage();
      await screen.findByTestId("permission-row-leads");
      await openUserOverrides();
      await waitFor(() => expect(permissionApi.getUserPermissions).toHaveBeenCalledWith("user-1"));

      const permissionsRow = await findRow("permissions");
      await userEvent.click(within(permissionsRow).getByRole("button", { name: "Manage permissions" }));
      await userEvent.click(saveButton());

      expect(mockModal.confirm).toHaveBeenCalledWith(
        expect.objectContaining({ title: expect.stringMatching(/own permission management/i) })
      );
      // Nothing is saved until the confirmation is accepted.
      expect(permissionApi.updateUserPermissions).not.toHaveBeenCalled();
    });

    it("does not confirm when editing SOMEONE ELSE's permissions.manage", async () => {
      useSessionStore.setState({ user: { _id: "admin-1", role: "admin" } });
      permissionApi.getUserPermissions.mockResolvedValue({
        data: { data: { permissions: { manage: true } } },
      });
      permissionApi.updateUserPermissions.mockResolvedValue({ data: { data: { permissions: {} } } });

      renderPage();
      await screen.findByTestId("permission-row-leads");
      await openUserOverrides();
      await waitFor(() => expect(permissionApi.getUserPermissions).toHaveBeenCalledWith("user-1"));

      const permissionsRow = await findRow("permissions");
      await userEvent.click(within(permissionsRow).getByRole("button", { name: "Manage permissions" }));
      await userEvent.click(saveButton());

      await waitFor(() => expect(permissionApi.updateUserPermissions).toHaveBeenCalled());
      expect(mockModal.confirm).not.toHaveBeenCalled();
    });
  });

  describe("Role Defaults tab", () => {
    it("defaults to Manager (not Admin — admin bypasses all permission checks, so its template is meaningless)", async () => {
      renderPage();

      await waitFor(() => {
        expect(permissionApi.getRoleTemplate).toHaveBeenCalledWith("manager");
      });
      expect(screen.queryByTitle("Admin")).not.toBeInTheDocument();
    });

    it("loads the selected role's current template and shows its last-updated info", async () => {
      const SALES_TEMPLATE = { role: "sales_associate", permissions: { leads: { view: true } } };
      permissionApi.getRoleTemplate.mockImplementation((role) =>
        Promise.resolve({ data: { data: role === "manager" ? MANAGER_TEMPLATE : SALES_TEMPLATE } })
      );

      renderPage();
      await waitFor(() => expect(permissionApi.getRoleTemplate).toHaveBeenCalledWith("manager"));

      fireEvent.mouseDown(screen.getByText("Manager"));
      expect(screen.queryByTitle("Admin")).not.toBeInTheDocument();
      await userEvent.click(await screen.findByTitle("Sales Associate"));

      await waitFor(() => {
        expect(permissionApi.getRoleTemplate).toHaveBeenCalledWith("sales_associate");
      });
      expect(await screen.findByText("Never edited — still the initial default template.")).toBeInTheDocument();
    });

    it("saves the edited template via PATCH /permissions/templates/:role", async () => {
      permissionApi.updateRoleTemplate.mockResolvedValue({
        data: { data: { ...MANAGER_TEMPLATE, permissions: { leads: { view: true, create: true, edit: true, delete: true } } } },
      });

      renderPage();
      await screen.findByTestId("permission-row-leads");

      await setLevel("leads", "Full");
      await userEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => {
        expect(permissionApi.updateRoleTemplate).toHaveBeenCalledWith(
          "manager",
          expect.objectContaining({ leads: expect.objectContaining({ delete: true }) })
        );
      });
      expect(message.success).toHaveBeenCalledWith("Role template updated");
    });
  });

  describe("User Overrides tab", () => {
    it("excludes admin from the user picker (2026-07-31 fix — same reasoning as Role Defaults' role exclusion)", async () => {
      renderPage();
      await screen.findByTestId("permission-row-leads");

      await userEvent.click(screen.getByRole("tab", { name: "Individual User Overrides" }));
      await waitFor(() => expect(screen.getByText("Select a user")).toBeVisible());
      fireEvent.mouseDown(screen.getByText("Select a user"));

      expect(await screen.findByTitle("Manager One (Manager)")).toBeInTheDocument();
      expect(screen.queryByTitle(/Site Admin/)).not.toBeInTheDocument();
    });

    it("strips a stale permission module no longer in the registry before saving (regression — a real 400 from the backend's validatePermissionsBody)", async () => {
      // "tasks" was removed from PERMISSION_REGISTRY entirely (§7.3) but this
      // user's stored permissions document still has it — exactly the real
      // state found in the dev database while diagnosing this bug.
      permissionApi.getUserPermissions.mockResolvedValue({
        data: { data: { leads: { view: true }, tasks: { view: true } } },
      });
      permissionApi.updateUserPermissions.mockResolvedValue({
        data: { data: { permissions: { leads: { view: true, create: true } } } },
      });

      renderPage();
      await screen.findByTestId("permission-row-leads");
      await openUserOverrides();

      await waitFor(() => expect(permissionApi.getUserPermissions).toHaveBeenCalledWith("user-1"));

      // "tasks" isn't a registered module, so it never gets a row at all —
      // the stale key is invisible in the UI, not merely stripped on save.
      expect(screen.queryByTestId("permission-row-tasks")).not.toBeInTheDocument();

      await setLevel("leads", "Edit");
      await userEvent.click(saveButton());

      await waitFor(() => expect(permissionApi.updateUserPermissions).toHaveBeenCalled());

      const [, sentPermissions] = permissionApi.updateUserPermissions.mock.calls[0];
      expect(sentPermissions).not.toHaveProperty("tasks");
      expect(message.success).toHaveBeenCalledWith("User permissions updated");
    });

    it("loads the selected user's actual permissions and saves via PATCH /users/:id/permissions", async () => {
      permissionApi.getUserPermissions.mockResolvedValue({
        data: { data: { leads: { view: true } } },
      });
      permissionApi.updateUserPermissions.mockResolvedValue({
        data: { data: { permissions: { leads: { view: true, create: true } } } },
      });

      renderPage();
      await screen.findByTestId("permission-row-leads");
      await openUserOverrides();

      await waitFor(() => expect(permissionApi.getUserPermissions).toHaveBeenCalledWith("user-1"));

      await setLevel("leads", "Edit");
      await userEvent.click(saveButton());

      await waitFor(() => {
        expect(permissionApi.updateUserPermissions).toHaveBeenCalledWith(
          "user-1",
          expect.objectContaining({ leads: expect.objectContaining({ create: true }) })
        );
      });
      expect(message.success).toHaveBeenCalledWith("User permissions updated");
    });

    it("resets a user's permissions to the role's current template via the confirm dialog", async () => {
      permissionApi.getUserPermissions.mockResolvedValue({ data: { data: {} } });
      // Reset applies the role's CURRENT template, so the response is that
      // template verbatim — which is what "restores the template exactly" then
      // asserts, via the divergence marker clearing.
      permissionApi.resetUserPermissions.mockResolvedValue({
        data: { data: { permissions: MANAGER_TEMPLATE.permissions } },
      });

      renderPage();
      await screen.findByTestId("permission-row-leads");
      await openUserOverrides();
      await screen.findByRole("button", { name: "Reset to Role Default" });

      await userEvent.click(screen.getByRole("button", { name: "Reset to Role Default" }));
      expect(await screen.findByText(/applies the role's CURRENT template/)).toBeInTheDocument();
      await userEvent.click(await screen.findByRole("button", { name: "Reset" }));

      await waitFor(() => {
        expect(permissionApi.resetUserPermissions).toHaveBeenCalledWith("user-1");
      });
      expect(message.success).toHaveBeenCalledWith("Reset to the role's current default");

      // Restored EXACTLY to the template: leads back to view+create (Edit),
      // and the divergence marker is gone.
      const leadsRow = await findRow("leads");
      await waitFor(() => expect(within(leadsRow).queryByTestId("row-diverges-leads")).not.toBeInTheDocument());
      expect(within(activePane()).getByText("No unsaved changes")).toBeInTheDocument();
    });

    it("deep-links straight to this tab with a user preselected via ?userId= (§7.32)", async () => {
      permissionApi.getUserPermissions.mockResolvedValue({ data: { data: { leads: { view: true } } } });

      renderPage(["/settings/permissions?userId=user-1"]);

      expect(await screen.findByText("Manager One (Manager)")).toBeInTheDocument();
      await waitFor(() => {
        expect(permissionApi.getUserPermissions).toHaveBeenCalledWith("user-1");
      });
    });
  });
});
