import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import HeaderUserControls from "./HeaderUserControls";
import * as notificationApi from "../modules/notification/api/notificationApi";

vi.mock("../modules/notification/api/notificationApi", () => ({
  listNotifications: vi.fn(),
  listNotificationsByType: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  markNotificationsReadByType: vi.fn(),
}));

const USER = { _id: "u1", name: "Vinay", role: "admin" };

function renderControls(props = {}) {
  return render(
    <MemoryRouter>
      <HeaderUserControls
        user={USER}
        canViewSettings
        onSignOut={vi.fn()}
        onEditProfile={vi.fn()}
        {...props}
      />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  notificationApi.listNotifications.mockResolvedValue({ data: { data: [] } });
});

/**
 * §1 (2026-08-05) — the sidebar footer's controls moved into the top strip.
 * The bell is RELOCATED, not rebuilt, so its own fetching must still happen.
 */
describe("HeaderUserControls", () => {
  it("renders the relocated notification bell, and it still fetches", async () => {
    renderControls();

    expect(await screen.findByRole("img", { name: "bell" })).toBeInTheDocument();
    expect(notificationApi.listNotifications).toHaveBeenCalled();
  });

  it("renders gear, name and sign out", () => {
    renderControls();

    expect(screen.getByLabelText("Settings")).toBeInTheDocument();
    expect(screen.getByText("Vinay")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sign out/ })).toBeInTheDocument();
  });

  it("hides the gear for a user without settings access", () => {
    renderControls({ canViewSettings: false });

    expect(screen.queryByLabelText("Settings")).not.toBeInTheDocument();
  });

  it("signs out when Sign out is clicked", async () => {
    const onSignOut = vi.fn();
    renderControls({ onSignOut });

    await userEvent.click(screen.getByRole("button", { name: /Sign out/ }));

    expect(onSignOut).toHaveBeenCalled();
  });

  it("opens Edit Profile from the name — the entry point the removed sidebar avatar used to provide", async () => {
    const onEditProfile = vi.fn();
    renderControls({ onEditProfile });

    await userEvent.click(screen.getByRole("button", { name: "Edit profile" }));

    expect(onEditProfile).toHaveBeenCalled();
  });

  it("always renders the collapsed account menu trigger, so nothing is unreachable at 390px", () => {
    renderControls();

    // Hidden above `sm` by CSS, but present in the DOM so the same actions
    // stay reachable on a narrow viewport without the strip overflowing.
    expect(screen.getByRole("button", { name: "Account menu" })).toBeInTheDocument();
  });
});
