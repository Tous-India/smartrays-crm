import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { message } from "antd";
import PermissionManagementPage from "./PermissionManagementPage";
import * as permissionApi from "../api/permissionApi";

vi.mock("antd", async (importOriginal) => {
  const actual = await importOriginal();
  // Components read `message` via `App.useApp()` (§7.28 message-rendering
  // fix — the static import silently fails to render under React 19), not
  // the static export, so the mock has to intercept the hook too.
  const mockMessage = { success: vi.fn(), error: vi.fn() };
  actual.App.useApp = () => ({ message: mockMessage });
  return { ...actual, message: mockMessage };
});

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

const REGISTRY = {
  leads: ["view", "create", "edit", "delete"],
  payments: ["view", "create"],
};

const MANAGER_TEMPLATE = {
  role: "manager",
  permissions: { leads: { view: true, create: true } },
  updatedBy: "user-1",
  updatedAt: "2026-07-01T00:00:00.000Z",
};

describe("PermissionManagementPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    permissionApi.getPermissionRegistry.mockResolvedValue({ data: { data: REGISTRY } });
  });

  it("renders the matrix with one row per registry module and only the valid actions as columns", async () => {
    permissionApi.getRoleTemplate.mockResolvedValue({
      data: { data: { role: "admin", permissions: {} } },
    });

    render(<PermissionManagementPage />);

    expect(await screen.findByText("leads")).toBeInTheDocument();
    expect(screen.getByText("payments")).toBeInTheDocument();

    // "delete" is valid for leads but not payments — payments' row shouldn't
    // render a checkbox for it.
    expect(screen.getByRole("checkbox", { name: "leads delete" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "payments delete" })).not.toBeInTheDocument();
  });

  describe("Role Defaults tab", () => {
    it("defaults to Manager (not Admin — admin bypasses all permission checks, so its template is meaningless)", async () => {
      permissionApi.getRoleTemplate.mockResolvedValue({ data: { data: MANAGER_TEMPLATE } });

      render(<PermissionManagementPage />);

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

      render(<PermissionManagementPage />);
      await waitFor(() => expect(permissionApi.getRoleTemplate).toHaveBeenCalledWith("manager"));

      // Switch to Executive (displayed label for the `employee` role) via
      // the role Select — also proves "Admin" isn't offered as an option.
      fireEvent.mouseDown(screen.getByText("Manager"));
      expect(screen.queryByTitle("Admin")).not.toBeInTheDocument();
      await userEvent.click(await screen.findByTitle("Sales Associate"));

      await waitFor(() => {
        expect(permissionApi.getRoleTemplate).toHaveBeenCalledWith("sales_associate");
      });
      expect(await screen.findByText("Never edited — still the initial default template.")).toBeInTheDocument();
    });

    it("saves the edited template via PATCH /permissions/templates/:role", async () => {
      permissionApi.getRoleTemplate.mockResolvedValue({ data: { data: MANAGER_TEMPLATE } });
      permissionApi.updateRoleTemplate.mockResolvedValue({
        data: { data: { ...MANAGER_TEMPLATE, permissions: { leads: { view: true, create: true, delete: true } } } },
      });

      render(<PermissionManagementPage />);
      await screen.findByText("leads");

      await userEvent.click(screen.getByRole("checkbox", { name: "leads delete" }));
      await userEvent.click(screen.getAllByRole("button", { name: "Save" })[0]);

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
      permissionApi.getRoleTemplate.mockResolvedValue({ data: { data: { role: "admin", permissions: {} } } });

      render(<PermissionManagementPage />);
      await screen.findByText("leads");

      await userEvent.click(screen.getByRole("tab", { name: "Individual User Overrides" }));
      await waitFor(() => expect(screen.getByText("Select a user")).toBeVisible());
      fireEvent.mouseDown(screen.getByText("Select a user"));

      expect(await screen.findByTitle("Manager One (Manager)")).toBeInTheDocument();
      expect(screen.queryByTitle(/Site Admin/)).not.toBeInTheDocument();
    });

    it("strips a stale permission module no longer in the registry before saving (regression — this is the actual Save-button bug: a real 400 from the backend's validatePermissionsBody, not a toast-rendering issue)", async () => {
      permissionApi.getRoleTemplate.mockResolvedValue({ data: { data: { role: "admin", permissions: {} } } });
      // "tasks" was removed from PERMISSION_REGISTRY entirely (§7.3) but this
      // user's stored permissions document still has it — exactly the real
      // state found in the dev database while diagnosing this bug.
      permissionApi.getUserPermissions.mockResolvedValue({
        data: { data: { leads: { view: true }, tasks: { view: true } } },
      });
      permissionApi.updateUserPermissions.mockResolvedValue({
        data: { data: { permissions: { leads: { view: true, create: true } } } },
      });

      render(<PermissionManagementPage />);
      await screen.findByText("leads");

      await userEvent.click(screen.getByRole("tab", { name: "Individual User Overrides" }));
      await waitFor(() => expect(screen.getByText("Select a user")).toBeVisible());
      fireEvent.mouseDown(screen.getByText("Select a user"));
      await userEvent.click(await screen.findByTitle("Manager One (Manager)"));

      await waitFor(() => expect(permissionApi.getUserPermissions).toHaveBeenCalledWith("user-1"));

      // "tasks" isn't a registered module, so it never gets a row/checkbox
      // at all — confirms the stale key is invisible in the UI, not just
      // stripped from the save payload.
      expect(screen.queryByText("tasks")).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole("checkbox", { name: "leads create" }));
      await userEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => {
        expect(permissionApi.updateUserPermissions).toHaveBeenCalledWith(
          "user-1",
          { leads: { view: true, create: true } }
        );
      });
      // The exact assertion that would have failed before the fix: "tasks"
      // must be completely absent from what's actually sent, not just
      // unmodified.
      const [, sentPermissions] = permissionApi.updateUserPermissions.mock.calls[0];
      expect(sentPermissions).not.toHaveProperty("tasks");
      expect(message.success).toHaveBeenCalledWith("User permissions updated");
    });

    it("loads the selected user's actual permissions and saves via PATCH /users/:id/permissions", async () => {
      permissionApi.getRoleTemplate.mockResolvedValue({ data: { data: { role: "admin", permissions: {} } } });
      permissionApi.getUserPermissions.mockResolvedValue({
        data: { data: { leads: { view: true } } },
      });
      permissionApi.updateUserPermissions.mockResolvedValue({
        data: { data: { permissions: { leads: { view: true, create: true } } } },
      });

      render(<PermissionManagementPage />);
      await screen.findByText("leads");

      await userEvent.click(screen.getByRole("tab", { name: "Individual User Overrides" }));
      await waitFor(() => expect(screen.getByText("Select a user")).toBeVisible());
      // AntD's Select placeholder span has `pointer-events: none` by design
      // (clicks pass through to the underlying search input), so a plain
      // userEvent.click on it fails userEvent's pointer-events safety
      // check — fireEvent.mouseDown bypasses that and is what actually
      // opens the dropdown, same fix already established for the Team
      // module's own member picker test.
      fireEvent.mouseDown(screen.getByText("Select a user"));
      await userEvent.click(await screen.findByTitle("Manager One (Manager)"));

      await waitFor(() => {
        expect(permissionApi.getUserPermissions).toHaveBeenCalledWith("user-1");
      });

      const matrix = await screen.findByRole("checkbox", { name: "leads view" });
      expect(matrix).toBeChecked();

      await userEvent.click(screen.getByRole("checkbox", { name: "leads create" }));
      await userEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => {
        expect(permissionApi.updateUserPermissions).toHaveBeenCalledWith(
          "user-1",
          expect.objectContaining({ leads: expect.objectContaining({ create: true }) })
        );
      });
      expect(message.success).toHaveBeenCalledWith("User permissions updated");
    });

    it("resets a user's permissions to the role's current template via the confirm dialog", async () => {
      permissionApi.getRoleTemplate.mockResolvedValue({ data: { data: { role: "admin", permissions: {} } } });
      permissionApi.getUserPermissions.mockResolvedValue({ data: { data: {} } });
      permissionApi.resetUserPermissions.mockResolvedValue({
        data: { data: { permissions: { leads: { view: true, create: true } } } },
      });

      render(<PermissionManagementPage />);
      await screen.findByText("leads");

      await userEvent.click(screen.getByRole("tab", { name: "Individual User Overrides" }));
      await waitFor(() => expect(screen.getByText("Select a user")).toBeVisible());
      // AntD's Select placeholder span has `pointer-events: none` by design
      // (clicks pass through to the underlying search input), so a plain
      // userEvent.click on it fails userEvent's pointer-events safety
      // check — fireEvent.mouseDown bypasses that and is what actually
      // opens the dropdown, same fix already established for the Team
      // module's own member picker test.
      fireEvent.mouseDown(screen.getByText("Select a user"));
      await userEvent.click(await screen.findByTitle("Manager One (Manager)"));
      await screen.findByRole("button", { name: "Reset to Role Default" });

      await userEvent.click(screen.getByRole("button", { name: "Reset to Role Default" }));
      expect(await screen.findByText(/applies the role's CURRENT template/)).toBeInTheDocument();
      await userEvent.click(await screen.findByRole("button", { name: "Reset" }));

      await waitFor(() => {
        expect(permissionApi.resetUserPermissions).toHaveBeenCalledWith("user-1");
      });
      expect(message.success).toHaveBeenCalledWith("Reset to the role's current default");
      expect(await screen.findByRole("checkbox", { name: "leads create" })).toBeChecked();
    });
  });
});
