import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import LiveMapView from "./LiveMapView";

const markerConstructorCalls = [];

/**
 * Stubs `window.google.maps` directly rather than mocking
 * `useGoogleMapsScript` — `GoogleMapView`'s loaded-state check
 * (`Boolean(window.google?.maps)`) reads this synchronously at mount, so
 * setting it before render is enough to skip the real script-load path
 * entirely, the same "mock the SDK loading at the global boundary" the task
 * asks for.
 */
function stubGoogleMaps() {
  markerConstructorCalls.length = 0;

  window.google = {
    maps: {
      Map: vi.fn(function Map() {
        this.fitBounds = vi.fn();
      }),
      Marker: vi.fn(function Marker(options) {
        markerConstructorCalls.push(options);
        this.setMap = vi.fn();
      }),
      Polyline: vi.fn(function Polyline() {
        this.setMap = vi.fn();
      }),
      LatLngBounds: vi.fn(function LatLngBounds() {
        this.extend = vi.fn();
      }),
    },
  };
}

vi.mock("../hooks/useLiveLocations", () => ({
  default: vi.fn(),
}));
vi.mock("../../../hooks/useUserDirectory", () => ({
  default: vi.fn(),
}));

const useLiveLocations = (await import("../hooks/useLiveLocations")).default;
const useUserDirectory = (await import("../../../hooks/useUserDirectory")).default;

beforeEach(() => {
  stubGoogleMaps();
  useUserDirectory.mockReturnValue({
    users: [
      { _id: "emp-1", name: "Employee One" },
      { _id: "emp-2", name: "Employee Two" },
    ],
  });
});

describe("LiveMapView", () => {
  it("renders one marker per visible employee's latest ping from GET /location/live", () => {
    useLiveLocations.mockReturnValue({
      liveLocations: [
        { employeeId: "emp-1", coords: { lat: 12.9, lng: 77.6 }, capturedAt: "2026-06-01T09:00:00.000Z" },
        { employeeId: "emp-2", coords: { lat: 13.0, lng: 77.7 }, capturedAt: "2026-06-01T09:05:00.000Z" },
      ],
      isLoading: false,
    });

    render(<LiveMapView />);

    expect(screen.getByTestId("google-map-container")).toBeInTheDocument();
    expect(markerConstructorCalls).toHaveLength(2);
    expect(markerConstructorCalls[0]).toMatchObject({ position: { lat: 12.9, lng: 77.6 }, title: "Employee One" });
    expect(markerConstructorCalls[1]).toMatchObject({ position: { lat: 13.0, lng: 77.7 }, title: "Employee Two" });

    // The legend list doubles as a human-readable check on the same data.
    expect(screen.getByText("Employee One")).toBeInTheDocument();
    expect(screen.getByText("Employee Two")).toBeInTheDocument();
  });

  it("shows an empty state with no markers when no one is currently visible/checked in", () => {
    useLiveLocations.mockReturnValue({ liveLocations: [], isLoading: false });

    render(<LiveMapView />);

    expect(markerConstructorCalls).toHaveLength(0);
    expect(screen.getByText(/No one is currently checked in/)).toBeInTheDocument();
  });
});
