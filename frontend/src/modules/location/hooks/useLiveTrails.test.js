import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

vi.mock("../api/locationApi", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    fetchLiveLocations: vi.fn(),
    fetchLocationHistory: vi.fn(),
  };
});
vi.mock("../../attendance/api/attendanceApi", () => ({
  getTeamAttendance: vi.fn(),
}));

const { fetchLiveLocations, fetchLocationHistory } = await import("../api/locationApi");
const { getTeamAttendance } = await import("../../attendance/api/attendanceApi");
const { default: useLiveTrails } = await import("./useLiveTrails");

const LIVE_ENTRY = {
  employeeId: "emp-1",
  attendanceId: "att-1",
  coords: { lat: 28.61, lng: 77.2 },
  capturedAt: "2026-08-26T06:40:00.000Z",
};

const PINGS = [
  { _id: "p1", coords: { lat: 28.61, lng: 77.2 }, capturedAt: "2026-08-26T06:36:00.000Z" },
  { _id: "p2", coords: { lat: 28.62, lng: 77.21 }, capturedAt: "2026-08-26T06:40:00.000Z" },
];

beforeEach(() => {
  vi.clearAllMocks();
  fetchLiveLocations.mockResolvedValue({ data: { data: [LIVE_ENTRY] } });
  getTeamAttendance.mockResolvedValue({
    data: { data: [{ _id: "att-1", checkIn: { coords: { lat: 28.6, lng: 77.19 } }, geofenceViolations: [] }] },
  });
});

/**
 * The regression these pin (§7.68).
 *
 * §7.67 changed `GET /location/history` from a flat ping array to
 * `{ endpoints, pings, ... }`. `useLiveTrails` kept reading `response.data.data`
 * as an array, so `trails[index].map(...)` threw and the whole live map fell
 * into its error state — "Could not load live locations" — for ANY employee
 * that had pings.
 *
 * It survived review because every check was run with ZERO live entries, where
 * `useLiveTrails` short-circuits before the trail fetch. Each test here
 * therefore uses a live entry that actually HAS pings.
 */
describe("useLiveTrails — history payload shape", () => {
  it("reads the trail from the §7.67 { endpoints, pings } shape", async () => {
    fetchLocationHistory.mockResolvedValue({
      data: { data: { endpoints: [], pings: PINGS, trailsIncluded: true } },
    });

    const { result } = renderHook(() => useLiveTrails());

    await waitFor(() => expect(result.current.entries).toHaveLength(1));
    expect(result.current.error).toBeNull();
    expect(result.current.entries[0].pings).toHaveLength(2);
    expect(result.current.entries[0].pings[1].coords).toEqual({ lat: 28.62, lng: 77.21 });
  });

  it("still accepts the legacy flat array — the two deploys are not atomic", async () => {
    fetchLocationHistory.mockResolvedValue({ data: { data: PINGS } });

    const { result } = renderHook(() => useLiveTrails());

    await waitFor(() => expect(result.current.entries).toHaveLength(1));
    expect(result.current.error).toBeNull();
    expect(result.current.entries[0].pings).toHaveLength(2);
  });

  it("does NOT fall into the error state when an employee has pings", async () => {
    // The user-visible symptom was a generic "Could not load live locations"
    // alert instead of a map, because the TypeError landed in the outer catch.
    fetchLocationHistory.mockResolvedValue({
      data: { data: { endpoints: [], pings: PINGS, trailsIncluded: true } },
    });

    const { result } = renderHook(() => useLiveTrails());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.entries).toHaveLength(1);
  });

  it("degrades to an empty trail rather than erroring when history fails outright", async () => {
    fetchLocationHistory.mockRejectedValue(new Error("network"));

    const { result } = renderHook(() => useLiveTrails());

    await waitFor(() => expect(result.current.entries).toHaveLength(1));
    expect(result.current.error).toBeNull();
    expect(result.current.entries[0].pings).toEqual([]);
  });
});
