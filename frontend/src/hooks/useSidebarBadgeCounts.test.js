import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import useSidebarBadgeCounts from "./useSidebarBadgeCounts";
import * as leadApi from "../modules/lead/api/leadApi";
import * as leaveApi from "../modules/leave/api/leaveApi";

vi.mock("../modules/lead/api/leadApi", () => ({
  getLeadCount: vi.fn(),
}));

vi.mock("../modules/leave/api/leaveApi", () => ({
  getPendingLeaveCount: vi.fn(),
}));

const POLL_INTERVAL_MS = 60000;

function advance(ms) {
  return act(() => vi.advanceTimersByTimeAsync(ms));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  leadApi.getLeadCount.mockResolvedValue({ data: { data: { count: 0 } } });
  leaveApi.getPendingLeaveCount.mockResolvedValue({ data: { data: { count: 0 } } });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useSidebarBadgeCounts", () => {
  it("fetches the new-leads count scoped by the caller (server-side), not client-filtered", async () => {
    leadApi.getLeadCount.mockResolvedValue({ data: { data: { count: 4 } } });

    const { result } = renderHook(() => useSidebarBadgeCounts({ canViewLeads: true, isAdmin: false }));
    await advance(0);

    expect(leadApi.getLeadCount).toHaveBeenCalledWith({ status: "new" });
    expect(result.current.newLeadsCount).toBe(4);
  });

  it("does not fetch the leads count at all when canViewLeads is false", async () => {
    renderHook(() => useSidebarBadgeCounts({ canViewLeads: false, isAdmin: false }));
    await advance(0);

    expect(leadApi.getLeadCount).not.toHaveBeenCalled();
  });

  it("fetches the pending leave count only when isAdmin is true", async () => {
    leaveApi.getPendingLeaveCount.mockResolvedValue({ data: { data: { count: 2 } } });

    const { result } = renderHook(() => useSidebarBadgeCounts({ canViewLeads: false, isAdmin: true }));
    await advance(0);

    expect(leaveApi.getPendingLeaveCount).toHaveBeenCalled();
    expect(result.current.pendingLeaveCount).toBe(2);
  });

  it("does not fetch the pending leave count at all for a non-admin", async () => {
    renderHook(() => useSidebarBadgeCounts({ canViewLeads: true, isAdmin: false }));
    await advance(0);

    expect(leaveApi.getPendingLeaveCount).not.toHaveBeenCalled();
  });

  it("refetches both counts on the polling interval", async () => {
    renderHook(() => useSidebarBadgeCounts({ canViewLeads: true, isAdmin: true }));
    await advance(0);

    expect(leadApi.getLeadCount).toHaveBeenCalledTimes(1);
    expect(leaveApi.getPendingLeaveCount).toHaveBeenCalledTimes(1);

    await advance(POLL_INTERVAL_MS);
    expect(leadApi.getLeadCount).toHaveBeenCalledTimes(2);
    expect(leaveApi.getPendingLeaveCount).toHaveBeenCalledTimes(2);

    await advance(POLL_INTERVAL_MS);
    expect(leadApi.getLeadCount).toHaveBeenCalledTimes(3);
    expect(leaveApi.getPendingLeaveCount).toHaveBeenCalledTimes(3);
  });

  it("leaves the last-known count in place if a poll fails, rather than throwing", async () => {
    leadApi.getLeadCount.mockResolvedValueOnce({ data: { data: { count: 3 } } });

    const { result } = renderHook(() => useSidebarBadgeCounts({ canViewLeads: true, isAdmin: false }));
    await advance(0);
    expect(result.current.newLeadsCount).toBe(3);

    leadApi.getLeadCount.mockRejectedValueOnce(new Error("network error"));
    await expect(advance(POLL_INTERVAL_MS)).resolves.not.toThrow();
    expect(result.current.newLeadsCount).toBe(3);
  });
});
