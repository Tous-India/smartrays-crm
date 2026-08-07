import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { NOTIFICATIONS_CHANGED_EVENT } from "../modules/notification/notificationEvents";
import useSidebarBadgeCounts, { LEAVE_NOTIFICATION_TYPES } from "./useSidebarBadgeCounts";
import * as notificationApi from "../modules/notification/api/notificationApi";

vi.mock("../modules/notification/api/notificationApi", () => ({
  listNotificationsByType: vi.fn(),
}));

const POLL_INTERVAL_MS = 60000;

function advance(ms) {
  return act(() => vi.advanceTimersByTimeAsync(ms));
}

function mockCountsByType({ leads = 0, leave = 0 } = {}) {
  notificationApi.listNotificationsByType.mockImplementation((types) => {
    if (types.includes("lead_created")) {
      return Promise.resolve({ data: { data: Array.from({ length: leads }) } });
    }
    return Promise.resolve({ data: { data: Array.from({ length: leave }) } });
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mockCountsByType();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useSidebarBadgeCounts", () => {
  it("fetches the unread lead_created/lead_assigned count when canViewLeads is true", async () => {
    mockCountsByType({ leads: 4 });

    const { result } = renderHook(() => useSidebarBadgeCounts({ canViewLeads: true }));
    await advance(0);

    expect(notificationApi.listNotificationsByType).toHaveBeenCalledWith(
      ["lead_created", "lead_assigned"],
      { unreadOnly: true }
    );
    expect(result.current.newLeadsCount).toBe(4);
  });

  it("does not fetch the leads count at all when canViewLeads is false", async () => {
    renderHook(() => useSidebarBadgeCounts({ canViewLeads: false }));
    await advance(0);

    expect(notificationApi.listNotificationsByType).not.toHaveBeenCalledWith(
      ["lead_created", "lead_assigned"],
      { unreadOnly: true }
    );
  });

  it("always fetches the unread leave-notification count, regardless of canViewLeads", async () => {
    mockCountsByType({ leave: 2 });

    const { result } = renderHook(() => useSidebarBadgeCounts({ canViewLeads: false }));
    await advance(0);

    expect(notificationApi.listNotificationsByType).toHaveBeenCalledWith(
      LEAVE_NOTIFICATION_TYPES,
      { unreadOnly: true }
    );
    expect(result.current.pendingLeaveCount).toBe(2);
  });

  it("refetches both counts on the polling interval", async () => {
    renderHook(() => useSidebarBadgeCounts({ canViewLeads: true }));
    await advance(0);

    expect(notificationApi.listNotificationsByType).toHaveBeenCalledTimes(2);

    await advance(POLL_INTERVAL_MS);
    expect(notificationApi.listNotificationsByType).toHaveBeenCalledTimes(4);

    await advance(POLL_INTERVAL_MS);
    expect(notificationApi.listNotificationsByType).toHaveBeenCalledTimes(6);
  });

  it("leaves the last-known count in place if a poll fails, rather than throwing", async () => {
    mockCountsByType({ leads: 3 });

    const { result } = renderHook(() => useSidebarBadgeCounts({ canViewLeads: true }));
    await advance(0);
    expect(result.current.newLeadsCount).toBe(3);

    notificationApi.listNotificationsByType.mockRejectedValueOnce(new Error("network error"));
    await expect(advance(POLL_INTERVAL_MS)).resolves.not.toThrow();
    expect(result.current.newLeadsCount).toBe(3);
  });

  /**
   * §7.43 (2026-08-06) — `clearLeadsBadge`/`clearLeaveBadge` are gone. They
   * were wired to nav `onNavigate` and marked every unread notification of a
   * type read merely because the user clicked a nav item.
   */
  it("exposes NO badge-clearing function — navigation must not dismiss anything", async () => {
    mockCountsByType({ leads: 5, leave: 3 });

    const { result } = renderHook(() => useSidebarBadgeCounts({ canViewLeads: true }));
    await advance(0);

    expect(result.current.clearLeadsBadge).toBeUndefined();
    expect(result.current.clearLeaveBadge).toBeUndefined();
    expect(Object.keys(result.current).sort()).toEqual(["newLeadsCount", "pendingLeaveCount"]);
  });

  it("counts leave_unapproved_absence toward the Leave badge", async () => {
    // If this list drifts from the backend enum, the bell shows a
    // notification the sidebar badge never counts.
    expect(LEAVE_NOTIFICATION_TYPES).toContain("leave_unapproved_absence");
  });

  it("refetches when the tab becomes visible again", async () => {
    mockCountsByType({ leads: 1, leave: 1 });

    renderHook(() => useSidebarBadgeCounts({ canViewLeads: true }));
    await advance(0);
    const before = notificationApi.listNotificationsByType.mock.calls.length;

    // Browsers throttle a backgrounded tab's timers, so without this listener
    // the badge stayed stale on return while the bell (which has it) updated.
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(notificationApi.listNotificationsByType.mock.calls.length).toBeGreaterThan(before);
  });

  it("refetches when the bell announces an explicit dismissal", async () => {
    mockCountsByType({ leads: 2, leave: 2 });

    renderHook(() => useSidebarBadgeCounts({ canViewLeads: true }));
    await advance(0);
    const before = notificationApi.listNotificationsByType.mock.calls.length;

    // The bell and this hook read the same data with no shared store; without
    // this the badge showed a stale count for a full poll interval after the
    // user dismissed something.
    await act(async () => {
      window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
    });

    expect(notificationApi.listNotificationsByType.mock.calls.length).toBeGreaterThan(before);
  });
});
