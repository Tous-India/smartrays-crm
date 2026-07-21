import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import MainLayout from "./MainLayout";
import useSessionStore from "../store/sessionStore";
import * as userApi from "../modules/user/api/userApi";

vi.mock("../modules/user/api/userApi", () => ({
  updateUser: vi.fn(),
}));

function renderLayout(initialPath = "/dashboard") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route element={<MainLayout />}>
          <Route path="/dashboard" element={<div>Dashboard Content</div>} />
          <Route path="/leads" element={<div>Leads Content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

const ADMIN_USER = {
  _id: "admin-1",
  name: "Priya Admin",
  email: "priya@smartrays.test",
  phone: "555-0100",
  role: "admin",
  permissions: {},
};

describe("MainLayout — nav composition and Settings gating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSessionStore.setState({ user: ADMIN_USER, isAuthenticated: true, isLoading: false });
  });

  it("shows a Settings group (User Management + Permission Settings) for an admin", async () => {
    renderLayout();

    const settingsGroup = await screen.findByText("Settings");
    await userEvent.click(settingsGroup);

    expect(await screen.findByText("User Management")).toBeInTheDocument();
    expect(screen.getByText("Permission Settings")).toBeInTheDocument();
  });

  it("hides the Settings group entirely for a user with neither users.* nor permissions.manage", async () => {
    useSessionStore.setState({
      user: { _id: "sales-1", name: "Sam Sales", role: "sales_associate", permissions: {} },
      isAuthenticated: true,
      isLoading: false,
    });

    renderLayout();

    await screen.findByText("Dashboard Content");
    expect(screen.queryByText("Settings")).not.toBeInTheDocument();
  });

  it("marks the current page's nav item as selected", async () => {
    renderLayout("/leads");

    const leadsLink = await screen.findByRole("menuitem", { name: "Leads" });
    expect(leadsLink.className).toContain("ant-menu-item-selected");

    const dashboardLink = screen.getByRole("menuitem", { name: "Dashboard" });
    expect(dashboardLink.className).not.toContain("ant-menu-item-selected");
  });
});

describe("MainLayout — sidebar footer profile menu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSessionStore.setState({ user: ADMIN_USER, isAuthenticated: true, isLoading: false });
  });

  it("shows the current user's name and role in the sidebar footer", async () => {
    renderLayout();

    expect(await screen.findByText("Priya Admin")).toBeInTheDocument();
    expect(screen.getByText("Admin")).toBeInTheDocument();
  });

  it("opens the Edit Profile modal from the sidebar footer dropdown and submits via PATCH /users/:id", async () => {
    userApi.updateUser.mockResolvedValue({ data: { data: {} } });

    renderLayout();

    await userEvent.click(await screen.findByText("Priya Admin"));
    await userEvent.click(await screen.findByText("Edit Profile"));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    const nameInput = screen.getByLabelText("Name");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Priya P. Admin");

    await userEvent.click(screen.getByRole("button", { name: "OK" }));

    await waitFor(() => {
      expect(userApi.updateUser).toHaveBeenCalledWith(
        "admin-1",
        expect.objectContaining({ name: "Priya P. Admin" })
      );
    });
  });

  it("does not render a duplicate profile menu in the top bar", async () => {
    renderLayout();

    await screen.findByText("Priya Admin");
    // Only one "Priya Admin" label exists on the page — the sidebar footer,
    // not also the top bar (§ UI/UX pass: one location for this menu, not
    // duplicated in both places).
    expect(screen.getAllByText("Priya Admin")).toHaveLength(1);
  });
});
