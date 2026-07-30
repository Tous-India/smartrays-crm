import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
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

  it("marks a notification read when clicked, clearing the badge immediately (no poll wait)", async () => {
    renderBell();
    await waitFor(() => expect(screen.getByText("1")).toBeInTheDocument());
    await userEvent.click(await screen.findByRole("button", { name: "Notifications" }));

    await userEvent.click(await screen.findByText("You've been assigned a lead: Acme Co"));

    await waitFor(() => {
      expect(notificationApi.markNotificationRead).toHaveBeenCalledWith("n1");
    });
    expect(screen.queryByText("1")).not.toBeInTheDocument();
  });

  it("marks all as read when the button is clicked, clearing the badge immediately (no poll wait)", async () => {
    renderBell();
    await waitFor(() => expect(screen.getByText("1")).toBeInTheDocument());
    await userEvent.click(await screen.findByRole("button", { name: "Notifications" }));

    await userEvent.click(await screen.findByRole("button", { name: /Mark all as read/ }));

    await waitFor(() => {
      expect(notificationApi.markAllNotificationsRead).toHaveBeenCalled();
    });
    expect(screen.queryByText("1")).not.toBeInTheDocument();
  });
});

// The bell doesn't automatically know how to route a new notification `type`
// — it only knows `relatedEntity.module`, and that mapping (`MODULE_ROUTES`)
// has to be updated by hand for each new module that starts calling
// `createNotification`. This is exactly the kind of thing that's easy to
// forget when wiring up a new notification type (Leave, here) — asserted
// directly rather than assumed.
describe("NotificationBell — leave notifications", () => {
  const LEAVE_NOTIFICATION = {
    _id: "n3",
    message: "Your paid leave request has been approved",
    isRead: false,
    createdAt: new Date().toISOString(),
    relatedEntity: { module: "leave", id: "leave-1" },
  };

  beforeEach(() => {
    notificationApi.listNotifications.mockResolvedValue({ data: { data: [LEAVE_NOTIFICATION] } });
  });

  it("displays a leave notification's message text", async () => {
    renderBell();
    await userEvent.click(await screen.findByRole("button", { name: "Notifications" }));

    expect(await screen.findByText("Your paid leave request has been approved")).toBeInTheDocument();
  });

  it("navigates to /leave (not a per-record detail route, which Leave has none of) when clicked", async () => {
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Routes>
          <Route path="/dashboard" element={<NotificationBell />} />
          <Route path="/leave" element={<div>Leave Page</div>} />
        </Routes>
      </MemoryRouter>
    );

    await userEvent.click(await screen.findByRole("button", { name: "Notifications" }));
    await userEvent.click(await screen.findByText("Your paid leave request has been approved"));

    expect(await screen.findByText("Leave Page")).toBeInTheDocument();
  });
});
