import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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

  it("navigates to /attendance for a leave notification — Leave has no per-record route and no page of its own since 2026-08-05", async () => {
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Routes>
          <Route path="/dashboard" element={<NotificationBell />} />
          <Route path="/attendance" element={<div>Leave Page</div>} />
        </Routes>
      </MemoryRouter>
    );

    await userEvent.click(await screen.findByRole("button", { name: "Notifications" }));
    await userEvent.click(await screen.findByText("Your paid leave request has been approved"));

    expect(await screen.findByText("Leave Page")).toBeInTheDocument();
  });
});

// BUG 2 regression (2026-08-04) — "notifications only appear after a manual
// page refresh, not via polling" was reported live. No existing test above
// exercised a SECOND poll tick at all — every one only asserted on the
// initial fetch. Real `setInterval`, advanced via fake timers, to prove the
// poll actually fires again and the badge actually re-renders with the new
// count — not just that the component doesn't crash.
describe("NotificationBell — polling picks up new notifications without a manual refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    notificationApi.markNotificationRead.mockResolvedValue({});
    notificationApi.markAllNotificationsRead.mockResolvedValue({});
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("re-fetches on the poll interval and updates the badge count when a new notification arrives", async () => {
    notificationApi.listNotifications.mockResolvedValueOnce({ data: { data: [NOTIFICATIONS[1]] } }); // 0 unread initially

    renderBell();
    await vi.advanceTimersByTimeAsync(0); // let the initial GET /notifications resolve

    expect(notificationApi.listNotifications).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("1")).not.toBeInTheDocument();

    // A new unread notification "arrives" server-side before the next poll.
    notificationApi.listNotifications.mockResolvedValueOnce({ data: { data: NOTIFICATIONS } }); // now 1 unread

    await vi.advanceTimersByTimeAsync(45000);
    expect(notificationApi.listNotifications).toHaveBeenCalledTimes(2);

    // Give React one more microtask tick to commit the state update from
    // the interval-triggered fetch before checking the DOM.
    await vi.advanceTimersByTimeAsync(0);
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  // The actual root cause: browsers throttle a backgrounded tab's
  // setInterval (sometimes heavily), so a user switching back to the tab
  // could otherwise wait well past POLL_INTERVAL_MS for their next real
  // poll — exactly the "works after a refresh, not via polling" symptom
  // reported live. This simulates that directly: the tab goes hidden well
  // BEFORE the interval would naturally fire, then becomes visible again —
  // the fix must refetch immediately on that visibility change, not wait
  // for whatever's left on the (possibly browser-delayed) interval.
  it("refetches immediately when the tab becomes visible again, without waiting for the poll interval", async () => {
    notificationApi.listNotifications.mockResolvedValueOnce({ data: { data: [NOTIFICATIONS[1]] } }); // 0 unread

    renderBell();
    await vi.advanceTimersByTimeAsync(0);
    expect(notificationApi.listNotifications).toHaveBeenCalledTimes(1);

    // A new unread notification arrives while the tab is backgrounded — far
    // fewer than POLL_INTERVAL_MS (45s) have elapsed.
    notificationApi.listNotifications.mockResolvedValueOnce({ data: { data: NOTIFICATIONS } });
    await vi.advanceTimersByTimeAsync(2000);
    expect(notificationApi.listNotifications).toHaveBeenCalledTimes(1); // interval hasn't fired yet

    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));

    await vi.advanceTimersByTimeAsync(0);
    expect(notificationApi.listNotifications).toHaveBeenCalledTimes(2);

    // One more microtask tick for React to commit the resulting state
    // update before checking the DOM (same as the poll-interval test above).
    await vi.advanceTimersByTimeAsync(0);
    expect(screen.getByText("1")).toBeInTheDocument();
  });
});
