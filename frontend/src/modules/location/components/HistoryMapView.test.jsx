import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import HistoryMapView from "./HistoryMapView";
import useSessionStore from "../../../store/sessionStore";

const polylineConstructorCalls = [];

function stubGoogleMaps() {
  polylineConstructorCalls.length = 0;

  window.google = {
    maps: {
      Map: vi.fn(function Map() {
        this.fitBounds = vi.fn();
      }),
      Marker: vi.fn(function Marker() {
        this.setMap = vi.fn();
      }),
      Polyline: vi.fn(function Polyline(options) {
        polylineConstructorCalls.push(options);
        this.setMap = vi.fn();
      }),
      LatLngBounds: vi.fn(function LatLngBounds() {
        this.extend = vi.fn();
      }),
    },
  };
}

vi.mock("../hooks/useLocationHistory", () => ({
  default: vi.fn(),
}));
vi.mock("../../../hooks/useUserDirectory", () => ({
  default: () => ({ users: [{ _id: "emp-1", name: "Employee One" }] }),
}));

const useLocationHistory = (await import("../hooks/useLocationHistory")).default;

beforeEach(() => {
  stubGoogleMaps();
  useSessionStore.setState({
    user: { _id: "emp-1", role: "employee", permissions: { location: { view: true } } },
    isAuthenticated: true,
    isLoading: false,
  });
});

describe("HistoryMapView", () => {
  it("fetches and renders the selected employee/date's ping trail as a polyline", () => {
    useLocationHistory.mockReturnValue({
      pings: [
        { coords: { lat: 12.9, lng: 77.6 }, capturedAt: "2026-06-01T09:00:00.000Z" },
        { coords: { lat: 12.91, lng: 77.61 }, capturedAt: "2026-06-01T09:05:00.000Z" },
      ],
      isLoading: false,
      error: null,
    });

    render(<HistoryMapView />);

    expect(screen.getByTestId("google-map-container")).toBeInTheDocument();
    expect(polylineConstructorCalls).toHaveLength(1);
    expect(polylineConstructorCalls[0].path).toEqual([
      { lat: 12.9, lng: 77.6 },
      { lat: 12.91, lng: 77.61 },
    ]);
  });

  it("shows an empty state instead of a blank map when there are no pings for that day", () => {
    useLocationHistory.mockReturnValue({ pings: [], isLoading: false, error: null });

    render(<HistoryMapView />);

    expect(polylineConstructorCalls).toHaveLength(0);
    expect(screen.getByText(/No location pings recorded/)).toBeInTheDocument();
  });

  it("shows a clear error instead of a blank map for an out-of-scope employee (404)", () => {
    useLocationHistory.mockReturnValue({
      pings: [],
      isLoading: false,
      error: { response: { status: 404 } },
    });

    render(<HistoryMapView />);

    expect(screen.getByText(/Could not load this employee's location history/)).toBeInTheDocument();
    expect(screen.getByText(/isn't visible to you/)).toBeInTheDocument();
  });
});

describe("HistoryMapView — reused for the Attendance map integration (§7.4d, 2026-08-04)", () => {
  it("locks to the given initialEmployeeId/initialDate and hides the pickers when showControls is false", () => {
    useLocationHistory.mockReturnValue({
      pings: [{ coords: { lat: 12.9, lng: 77.6 }, capturedAt: "2026-06-01T09:00:00.000Z" }],
      isLoading: false,
      error: null,
    });

    render(<HistoryMapView initialEmployeeId="emp-9" initialDate="2026-06-01" showControls={false} />);

    expect(useLocationHistory).toHaveBeenCalledWith({ employeeId: "emp-9", date: "2026-06-01" });
    expect(screen.queryByPlaceholderText("Select an employee")).not.toBeInTheDocument();
    expect(screen.getByTestId("google-map-container")).toBeInTheDocument();
  });

  it("passes deriveExtraMarkers(pings) through to GoogleMapView as markers", () => {
    const pings = [{ coords: { lat: 12.9, lng: 77.6 }, capturedAt: "2026-06-01T09:00:00.000Z" }];
    useLocationHistory.mockReturnValue({ pings, isLoading: false, error: null });
    const deriveExtraMarkers = vi.fn(() => [{ lat: 1, lng: 1, label: "Test marker", color: "red" }]);

    render(<HistoryMapView deriveExtraMarkers={deriveExtraMarkers} />);

    expect(deriveExtraMarkers).toHaveBeenCalledWith(pings);
    expect(window.google.maps.Marker).toHaveBeenCalledWith(
      expect.objectContaining({ icon: { url: expect.stringContaining("red-dot.png") } })
    );
  });
});
