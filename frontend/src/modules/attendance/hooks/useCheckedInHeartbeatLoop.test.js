import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import useCheckedInHeartbeatLoop from "./useCheckedInHeartbeatLoop";
import * as attendanceApi from "../api/attendanceApi";
import * as locationApi from "../../location/api/locationApi";

vi.mock("../api/attendanceApi", () => ({
  heartbeat: vi.fn(),
}));

vi.mock("../../location/api/locationApi", () => ({
  submitLocationPing: vi.fn(),
  fetchLocationConfig: vi.fn(),
}));

const HEARTBEAT_INTERVAL_MS = 3 * 60 * 1000;
const PING_INTERVAL_MINUTES = 2;
const PING_INTERVAL_MS = PING_INTERVAL_MINUTES * 60 * 1000;

function mockGeolocation() {
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: vi.fn((success) =>
        success({ coords: { latitude: 12.34, longitude: 56.78 } })
      ),
    },
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mockGeolocation();
  attendanceApi.heartbeat.mockResolvedValue({ data: { data: {} } });
  locationApi.submitLocationPing.mockResolvedValue({ data: { data: {} } });
  locationApi.fetchLocationConfig.mockResolvedValue({
    data: { data: { pingIntervalMinutes: PING_INTERVAL_MINUTES } },
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useCheckedInHeartbeatLoop — fresh check-in", () => {
  it("starts both the heartbeat and location-ping intervals once active", async () => {
    const { rerender } = renderHook(({ isActive }) => useCheckedInHeartbeatLoop(isActive), {
      initialProps: { isActive: false },
    });

    expect(attendanceApi.heartbeat).not.toHaveBeenCalled();

    rerender({ isActive: true });
    await vi.advanceTimersByTimeAsync(0); // let GET /location/config resolve before intervals are set

    // §7.71: one tick fires IMMEDIATELY on start, then the intervals.
    expect(attendanceApi.heartbeat).toHaveBeenCalledTimes(1);
    expect(locationApi.submitLocationPing).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS);
    expect(attendanceApi.heartbeat).toHaveBeenCalledTimes(2);

    expect(locationApi.submitLocationPing).toHaveBeenCalledWith({
      coords: { lat: 12.34, lng: 56.78 },
      capturedAt: expect.any(String),
    });
  });

  it("sends the first ping at once, not one interval later (§7.71)", async () => {
    // A freshly checked-in employee must appear on the live map immediately.
    // Before this, the first ping came a full LOCATION_PING_INTERVAL later.
    renderHook(() => useCheckedInHeartbeatLoop(true));
    await vi.advanceTimersByTimeAsync(0);

    expect(locationApi.submitLocationPing).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(PING_INTERVAL_MS - 1);
    expect(locationApi.submitLocationPing).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(locationApi.submitLocationPing).toHaveBeenCalledTimes(2);
  });

  it("keeps pinging at the configured interval across many periods", async () => {
    renderHook(() => useCheckedInHeartbeatLoop(true));
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(PING_INTERVAL_MS * 5);

    // 1 immediate + 5 intervals.
    expect(locationApi.submitLocationPing).toHaveBeenCalledTimes(6);
  });
});

describe("useCheckedInHeartbeatLoop — resume on reload", () => {
  it("starts the intervals immediately when mounted with isActive already true (page loaded mid-shift)", async () => {
    renderHook(() => useCheckedInHeartbeatLoop(true));

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS);

    // Immediate tick + one interval (§7.71).
    expect(attendanceApi.heartbeat).toHaveBeenCalledTimes(2);
  });
});

describe("useCheckedInHeartbeatLoop — stops on check-out", () => {
  it("stops both intervals once isActive flips back to false", async () => {
    const { rerender } = renderHook(({ isActive }) => useCheckedInHeartbeatLoop(isActive), {
      initialProps: { isActive: true },
    });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS);
    expect(attendanceApi.heartbeat).toHaveBeenCalledTimes(2); // immediate + one interval

    rerender({ isActive: false });

    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS * 5);
    // No further calls after check-out — still exactly the two from before.
    expect(attendanceApi.heartbeat).toHaveBeenCalledTimes(2);
  });
});

describe("useCheckedInHeartbeatLoop — cleanup on unmount", () => {
  it("clears both intervals on unmount so nothing fires afterward (no leaked intervals)", async () => {
    const { unmount } = renderHook(() => useCheckedInHeartbeatLoop(true));
    await vi.advanceTimersByTimeAsync(0);

    // The immediate first tick has already fired by now (§7.71).
    expect(attendanceApi.heartbeat).toHaveBeenCalledTimes(1);
    expect(locationApi.submitLocationPing).toHaveBeenCalledTimes(1);

    unmount();

    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS * 10);
    expect(attendanceApi.heartbeat).toHaveBeenCalledTimes(1);
    expect(locationApi.submitLocationPing).toHaveBeenCalledTimes(1);
  });
});

describe("useCheckedInHeartbeatLoop — failure handling", () => {
  it("does not throw when a heartbeat call fails, and keeps the interval running", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    attendanceApi.heartbeat.mockRejectedValue(new Error("network error"));

    renderHook(() => useCheckedInHeartbeatLoop(true));
    await vi.advanceTimersByTimeAsync(0);

    await expect(vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS)).resolves.not.toThrow();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("heartbeat"),
      expect.any(Error)
    );

    // The next tick still fires — one failure doesn't kill the interval.
    // (immediate + two intervals)
    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS);
    expect(attendanceApi.heartbeat).toHaveBeenCalledTimes(3);

    consoleErrorSpy.mockRestore();
  });

  it("does not throw when a location ping fails", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    locationApi.submitLocationPing.mockRejectedValue(new Error("network error"));

    renderHook(() => useCheckedInHeartbeatLoop(true));
    await vi.advanceTimersByTimeAsync(0);

    await expect(vi.advanceTimersByTimeAsync(PING_INTERVAL_MS)).resolves.not.toThrow();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("ping"),
      expect.any(Error)
    );

    consoleErrorSpy.mockRestore();
  });

  it("falls back to the 2-minute default ping cadence when GET /location/config itself fails, without affecting the heartbeat loop", async () => {
    locationApi.fetchLocationConfig.mockRejectedValue(new Error("404: not found"));

    // 1. The loop still starts successfully — resolvePingIntervalMinutes'
    // try/catch means a rejected config fetch never propagates and never
    // blocks startIntervals() from running.
    await expect(
      (async () => {
        renderHook(() => useCheckedInHeartbeatLoop(true));
        await vi.advanceTimersByTimeAsync(0);
      })()
    ).resolves.not.toThrow();

    // 2. The ping fires on FALLBACK_PING_INTERVAL_MINUTES (2 min) — not
    // never, and not some other interval. The immediate first tick (§7.71)
    // has already fired; confirmed by checking the NEXT one hasn't fired a
    // second early, then that it fires exactly at the 2-minute mark.
    await vi.advanceTimersByTimeAsync(PING_INTERVAL_MS - 1000);
    expect(locationApi.submitLocationPing).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(locationApi.submitLocationPing).toHaveBeenCalledTimes(2);
    expect(locationApi.submitLocationPing).toHaveBeenCalledWith({
      coords: { lat: 12.34, lng: 56.78 },
      capturedAt: expect.any(String),
    });

    // 3. The heartbeat loop is genuinely independent — it isn't gated
    // behind resolvePingIntervalMinutes() at all, so it fires on its own
    // 3-minute schedule completely unaffected by the config fetch failing.
    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS - PING_INTERVAL_MS);
    expect(attendanceApi.heartbeat).toHaveBeenCalledTimes(2); // immediate + one 3-minute tick
  });
});

/**
 * §7.71: two server answers mean there is nothing left to track and must END
 * the loop, not be retried every interval.
 */
describe("useCheckedInHeartbeatLoop — stops itself on a terminal answer", () => {
  function rejectionWithStatus(status) {
    return Object.assign(new Error(`HTTP ${status}`), { response: { status } });
  }

  it("stops on 401 — the session is gone, and the 401 interceptor only redirects on SESSION_EXPIRED", async () => {
    attendanceApi.heartbeat.mockRejectedValue(rejectionWithStatus(401));
    locationApi.submitLocationPing.mockRejectedValue(rejectionWithStatus(401));

    renderHook(() => useCheckedInHeartbeatLoop(true));
    await vi.advanceTimersByTimeAsync(0);
    expect(locationApi.submitLocationPing).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(PING_INTERVAL_MS * 5);
    expect(locationApi.submitLocationPing).toHaveBeenCalledTimes(1);
    expect(attendanceApi.heartbeat).toHaveBeenCalledTimes(1);
  });

  it("stops on 409 — the server says there is no open shift (checked out elsewhere)", async () => {
    locationApi.submitLocationPing.mockRejectedValue(rejectionWithStatus(409));

    renderHook(() => useCheckedInHeartbeatLoop(true));
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(PING_INTERVAL_MS * 5);

    expect(locationApi.submitLocationPing).toHaveBeenCalledTimes(1);
  });

  it("does NOT stop on an ordinary failure — a 500 or a network blip is retried next interval", async () => {
    locationApi.submitLocationPing.mockRejectedValue(rejectionWithStatus(500));

    renderHook(() => useCheckedInHeartbeatLoop(true));
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(PING_INTERVAL_MS * 3);

    expect(locationApi.submitLocationPing).toHaveBeenCalledTimes(4);
  });

  it("restarts when isActive goes false then true again after a terminal stop (a fresh check-in)", async () => {
    locationApi.submitLocationPing.mockRejectedValueOnce(rejectionWithStatus(409));

    const { rerender } = renderHook(({ isActive }) => useCheckedInHeartbeatLoop(isActive), {
      initialProps: { isActive: true },
    });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(PING_INTERVAL_MS * 2);
    expect(locationApi.submitLocationPing).toHaveBeenCalledTimes(1);

    rerender({ isActive: false });
    rerender({ isActive: true });
    await vi.advanceTimersByTimeAsync(0);

    expect(locationApi.submitLocationPing).toHaveBeenCalledTimes(2);
  });
});
