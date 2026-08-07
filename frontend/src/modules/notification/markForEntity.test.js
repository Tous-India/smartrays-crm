import { describe, it, expect, vi, beforeEach } from "vitest";
import { markNotificationsForEntity } from "./markForEntity";
import { NOTIFICATIONS_CHANGED_EVENT } from "./notificationEvents";
import * as notificationApi from "./api/notificationApi";

/**
 * §7.44 (2026-08-06) — dismissal on genuine engagement.
 *
 * Deliberately NOT a bulk clear by type: that was the §7.43 bug, where
 * clicking a nav item marked everything read whether or not it had been seen.
 * Acting on request X dismisses X's notification and leaves Y's alone.
 */

vi.mock("./api/notificationApi", () => ({
  listNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
}));

const note = (id, module, entityId, isRead = false) => ({
  _id: id,
  type: "leave_requested",
  isRead,
  relatedEntity: { module, id: entityId },
});

beforeEach(() => {
  vi.clearAllMocks();
  notificationApi.markNotificationRead.mockResolvedValue({ data: {} });
});

describe("markNotificationsForEntity", () => {
  it("marks ONLY the notification for that record", async () => {
    notificationApi.listNotifications.mockResolvedValue({
      data: {
        data: [
          note("n1", "leave", "leave-1"),
          note("n2", "leave", "leave-2"),
          note("n3", "leads", "leave-1"), // same id, different module
        ],
      },
    });

    const marked = await markNotificationsForEntity("leave", "leave-1");

    expect(marked).toBe(1);
    expect(notificationApi.markNotificationRead).toHaveBeenCalledTimes(1);
    expect(notificationApi.markNotificationRead).toHaveBeenCalledWith("n1");
    // Acting on one request must never clear another's badge.
    expect(notificationApi.markNotificationRead).not.toHaveBeenCalledWith("n2");
    expect(notificationApi.markNotificationRead).not.toHaveBeenCalledWith("n3");
  });

  it("compares ids as strings, so an ObjectId and its string form match", async () => {
    notificationApi.listNotifications.mockResolvedValue({
      data: { data: [{ ...note("n1", "leave", "leave-1"), relatedEntity: { module: "leave", id: "leave-1" } }] },
    });

    expect(await markNotificationsForEntity("leave", { toString: () => "leave-1" })).toBe(1);
  });

  it("skips notifications already read — no redundant PATCH", async () => {
    notificationApi.listNotifications.mockResolvedValue({
      data: { data: [note("n1", "leave", "leave-1", true)] },
    });

    expect(await markNotificationsForEntity("leave", "leave-1")).toBe(0);
    expect(notificationApi.markNotificationRead).not.toHaveBeenCalled();
  });

  it("announces the change so the bell and BOTH sidebar badges update in the same tick", async () => {
    notificationApi.listNotifications.mockResolvedValue({
      data: { data: [note("n1", "leave", "leave-1")] },
    });
    const listener = vi.fn();
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, listener);

    await markNotificationsForEntity("leave", "leave-1");

    // Without this the sidebar lags up to its own 60s poll behind the action.
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, listener);
  });

  it("does not announce when nothing was marked", async () => {
    notificationApi.listNotifications.mockResolvedValue({ data: { data: [] } });
    const listener = vi.fn();
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, listener);

    await markNotificationsForEntity("leave", "leave-1");

    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, listener);
  });

  it("never throws — dismissal is a side effect of the real action", async () => {
    notificationApi.listNotifications.mockRejectedValue(new Error("network"));

    // The leave decision already succeeded; failing here would report an
    // error the user did not cause and does not care about.
    await expect(markNotificationsForEntity("leave", "leave-1")).resolves.toBe(0);
  });

  it("is a no-op without a module or id", async () => {
    expect(await markNotificationsForEntity(null, "leave-1")).toBe(0);
    expect(await markNotificationsForEntity("leave", null)).toBe(0);
    expect(notificationApi.listNotifications).not.toHaveBeenCalled();
  });

  it("marks every notification pointing at the same record", async () => {
    // A leave request notifies the manager AND every admin; the acting user
    // only ever sees their own, but the filter is by entity, not by user.
    notificationApi.listNotifications.mockResolvedValue({
      data: { data: [note("n1", "leave", "leave-1"), note("n2", "leave", "leave-1")] },
    });

    expect(await markNotificationsForEntity("leave", "leave-1")).toBe(2);
    expect(notificationApi.markNotificationRead).toHaveBeenCalledTimes(2);
  });
});
