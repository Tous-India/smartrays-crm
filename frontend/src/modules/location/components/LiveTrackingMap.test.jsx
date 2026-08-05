import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import LiveTrackingMap from "./LiveTrackingMap";
import * as locationApi from "../api/locationApi";
import * as attendanceApi from "../../attendance/api/attendanceApi";

// The map itself is exercised by LeafletMapView's own consumers; stubbed here
// so these tests are about what the live view DERIVES, not about Leaflet.
vi.mock("../../../components/LeafletMapView", () => ({
  default: ({ markers, paths }) => (
    <div
      data-testid="map"
      data-markers={JSON.stringify(markers)}
      data-path-count={paths.length}
    />
  ),
}));

vi.mock("../api/locationApi", () => ({
  fetchLiveLocations: vi.fn(),
  fetchLocationHistory: vi.fn(),
}));
vi.mock("../../attendance/api/attendanceApi", () => ({
  getTeamAttendance: vi.fn(),
}));
vi.mock("../../../hooks/useUserDirectory", () => ({
  default: () => ({ users: [{ _id: "emp-1", name: "Priya" }] }),
}));

const NOW = new Date(2026, 7, 5, 12, 0, 0);

function minutesAgo(minutes) {
  return new Date(NOW.getTime() - minutes * 60000).toISOString();
}

function liveEntry(capturedAt) {
  return {
    employeeId: "emp-1",
    attendanceId: "att-1",
    coords: { lat: 28.6, lng: 77.2 },
    capturedAt,
  };
}

function markersFrom() {
  return JSON.parse(screen.getByTestId("map").getAttribute("data-markers"));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
  attendanceApi.getTeamAttendance.mockResolvedValue({ data: { data: [] } });
  locationApi.fetchLocationHistory.mockResolvedValue({ data: { data: [] } });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("LiveTrackingMap — staleness", () => {
  it("marks a RECENT position as live, in green, with no stale tag", async () => {
    locationApi.fetchLiveLocations.mockResolvedValue({ data: { data: [liveEntry(minutesAgo(2))] } });

    render(<LiveTrackingMap />);

    await screen.findByTestId("map");
    expect(markersFrom().at(-1).color).toBe("green");
    expect(screen.queryByTestId("stale-emp-1")).not.toBeInTheDocument();
    expect(screen.getByText(/last updated 2m ago/)).toBeInTheDocument();
  });

  it("marks a position older than the threshold as STALE — a frozen marker must never read as live", async () => {
    locationApi.fetchLiveLocations.mockResolvedValue({ data: { data: [liveEntry(minutesAgo(45))] } });

    render(<LiveTrackingMap />);

    await screen.findByTestId("map");
    expect(markersFrom().at(-1).color).toBe("red");
    expect(screen.getByTestId("stale-emp-1")).toHaveTextContent(/Stale/);
    expect(markersFrom().at(-1).label).toMatch(/STALE/);
  });
});

describe("LiveTrackingMap — trail, start marker and geofence points", () => {
  it("drops a check-in start marker from the attendance record, not a second stored copy", async () => {
    locationApi.fetchLiveLocations.mockResolvedValue({ data: { data: [liveEntry(minutesAgo(1))] } });
    attendanceApi.getTeamAttendance.mockResolvedValue({
      data: { data: [{ _id: "att-1", checkIn: { coords: { lat: 28.5, lng: 77.1 } }, geofenceViolations: [] }] },
    });

    render(<LiveTrackingMap />);

    await screen.findByTestId("map");
    const start = markersFrom().find((marker) => marker.color === "blue");
    expect(start).toMatchObject({ lat: 28.5, lng: 77.1 });
    expect(start.label).toMatch(/checked in here/);
  });

  it("builds a polyline from the ping trail", async () => {
    locationApi.fetchLiveLocations.mockResolvedValue({ data: { data: [liveEntry(minutesAgo(1))] } });
    locationApi.fetchLocationHistory.mockResolvedValue({
      data: {
        data: [
          { _id: "p1", coords: { lat: 28.5, lng: 77.1 }, capturedAt: minutesAgo(20) },
          { _id: "p2", coords: { lat: 28.6, lng: 77.2 }, capturedAt: minutesAgo(1) },
        ],
      },
    });

    render(<LiveTrackingMap />);

    await waitFor(() => expect(screen.getByTestId("map").getAttribute("data-path-count")).toBe("1"));
  });

  it("marks pings inside a geofence violation window distinctly, derived from the attendance intervals", async () => {
    locationApi.fetchLiveLocations.mockResolvedValue({ data: { data: [liveEntry(minutesAgo(1))] } });
    locationApi.fetchLocationHistory.mockResolvedValue({
      data: {
        data: [
          { _id: "p1", coords: { lat: 28.5, lng: 77.1 }, capturedAt: minutesAgo(30) },
          { _id: "p2", coords: { lat: 28.9, lng: 77.9 }, capturedAt: minutesAgo(20) },
        ],
      },
    });
    attendanceApi.getTeamAttendance.mockResolvedValue({
      data: {
        data: [
          {
            _id: "att-1",
            checkIn: { coords: null },
            // Only the SECOND ping falls inside this window.
            geofenceViolations: [{ start: minutesAgo(25), end: minutesAgo(15), maxDistanceMeters: 900 }],
          },
        ],
      },
    });

    render(<LiveTrackingMap />);

    await screen.findByTestId("map");
    const violationMarkers = markersFrom().filter((marker) => marker.color === "orange");
    expect(violationMarkers).toHaveLength(1);
    expect(violationMarkers[0]).toMatchObject({ lat: 28.9, lng: 77.9 });
    expect(await screen.findByText("1 outside geofence")).toBeInTheDocument();
  });
});

describe("LiveTrackingMap — who appears", () => {
  it("shows an empty state when nobody is checked in — checked-out staff simply aren't returned", async () => {
    locationApi.fetchLiveLocations.mockResolvedValue({ data: { data: [] } });

    render(<LiveTrackingMap />);

    expect(
      await screen.findByText("No one is currently checked in and visible to you")
    ).toBeInTheDocument();
  });

  it("surfaces a fetch failure rather than rendering an empty map that looks like 'nobody is working'", async () => {
    locationApi.fetchLiveLocations.mockRejectedValue(new Error("boom"));

    render(<LiveTrackingMap />);

    expect(await screen.findByText("Could not load live locations")).toBeInTheDocument();
  });

  it("still renders the trail when attendance coords are unavailable (no view_location grant)", async () => {
    locationApi.fetchLiveLocations.mockResolvedValue({ data: { data: [liveEntry(minutesAgo(1))] } });
    attendanceApi.getTeamAttendance.mockRejectedValue(new Error("403"));

    render(<LiveTrackingMap />);

    await screen.findByTestId("map");
    // No blue start marker, but the current position is still plotted.
    expect(markersFrom().some((marker) => marker.color === "blue")).toBe(false);
    expect(markersFrom().some((marker) => marker.color === "green")).toBe(true);
  });
});
