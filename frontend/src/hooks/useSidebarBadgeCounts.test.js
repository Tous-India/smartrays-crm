import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import useSidebarBadgeCounts from "./useSidebarBadgeCounts";
import * as notificationApi from "../modules/notification/api/notificationApi";

vi.mock("../modules/notification/api/notificationApi", () => ({
  listNotificationsByType: vi.fn(),
  markNotificationsReadByType: vi.fn(),
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
  notificationApi.markNotificationsReadByType.mockResolvedValue({ data: {} });
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
      ["leave_requested", "leave_approved", "leave_declined"],
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

  it("clearLeadsBadge marks lead_created/lead_assigned as read and zeroes the count immediately", async () => {
    mockCountsByType({ leads: 5 });

    const { result } = renderHook(() => useSidebarBadgeCounts({ canViewLeads: true }));
    await advance(0);
    expect(result.current.newLeadsCount).toBe(5);

    await act(() => result.current.clearLeadsBadge());

    expect(notificationApi.markNotificationsReadByType).toHaveBeenCalledWith(["lead_created", "lead_assigned"]);
    expect(result.current.newLeadsCount).toBe(0);
  });

  it("clearLeaveBadge marks leave notifications as read and zeroes the count immediately, without touching the leads count", async () => {
    mockCountsByType({ leads: 5, leave: 3 });

    const { result } = renderHook(() => useSidebarBadgeCounts({ canViewLeads: true }));
    await advance(0);
    expect(result.current.pendingLeaveCount).toBe(3);

    await act(() => result.current.clearLeaveBadge());

    expect(notificationApi.markNotificationsReadByType).toHaveBeenCalledWith([
      "leave_requested",
      "leave_approved",
      "leave_declined",
    ]);
    expect(result.current.pendingLeaveCount).toBe(0);
    expect(result.current.newLeadsCount).toBe(5);
  });
});
