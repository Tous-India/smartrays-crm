import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import NotificationBell from "./NotificationBell";
import * as notificationApi from "../api/notificationApi";

vi.mock("../api/notificationApi", () => ({
  listNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
}));

const NOTIFICATIONS = [
  {
    _id: "n1",
    message: "You've been assigned a lead: Acme Co",
    isRead: false,
    createdAt: new Date().toISOString(),
    relatedEntity: { module: "leads", id: "lead-1" },
  },
  {
    _id: "n2",
    message: "Follow-up due for Beta Co",
    isRead: true,
    createdAt: new Date().toISOString(),
    relatedEntity: { module: "leads", id: "lead-2" },
  },
];

function renderBell() {
  return render(
    <MemoryRouter>
      <NotificationBell />
    </MemoryRouter>
  );
}

describe("NotificationBell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    notificationApi.listNotifications.mockResolvedValue({ data: { data: NOTIFICATIONS } });
    notificationApi.markNotificationRead.mockResolvedValue({});
    notificationApi.markAllNotificationsRead.mockResolvedValue({});
  });

  it("shows the unread count badge", async () => {
    renderBell();

    await waitFor(() => {
      expect(screen.getByText("1")).toBeInTheDocument();
    });
  });

  it("shows no badge when there are no unread notifications", async () => {
    notificationApi.listNotifications.mockResolvedValue({
      data: { data: [{ ...NOTIFICATIONS[1] }] },
    });
    renderBell();

    await waitFor(() => {
      expect(notificationApi.listNotifications).toHaveBeenCalled();
    });

    expect(screen.queryByText("1")).not.toBeInTheDocument();
  });

  it("opens the panel and lists notifications with message text", async () => {
    renderBell();
    await userEvent.click(await screen.findByRole("button", { name: "Notifications" }));

    expect(await screen.findByText("You've been assigned a lead: Acme Co")).toBeInTheDocument();
    expect(screen.getByText("Follow-up due for Beta Co")).toBeInTheDocument();
  });

  it("marks a notification read when clicked", async () => {
    renderBell();
    await userEvent.click(await screen.findByRole("button", { name: "Notifications" }));

    await userEvent.click(await screen.findByText("You've been assigned a lead: Acme Co"));

    await waitFor(() => {
      expect(notificationApi.markNotificationRead).toHaveBeenCalledWith("n1");
    });
  });

  it("marks all as read when the button is clicked", async () => {
    renderBell();
    await userEvent.click(await screen.findByRole("button", { name: "Notifications" }));

    await userEvent.click(await screen.findByRole("button", { name: /Mark all as read/ }));

    await waitFor(() => {
      expect(notificationApi.markAllNotificationsRead).toHaveBeenCalled();
    });
  });
});
