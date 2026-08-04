import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import LiveMapView from "./LiveMapView";

const markerCalls = [];

/**
 * Stubs `react-leaflet` at the module boundary rather than rendering a real
 * `MapContainer` — Leaflet's real `Map` class needs actual browser DOM
 * measurement/tile loading jsdom doesn't support, the same reason the
 * earlier Google Maps SDK was stubbed rather than rendered for real.
 */
vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }) => <div data-testid="rl-map">{children}</div>,
  TileLayer: () => null,
  Marker: (props) => {
    markerCalls.push(props);
    return <div data-testid="rl-marker" />;
  },
  Polyline: () => <div data-testid="rl-polyline" />,
  useMap: () => ({ fitBounds: vi.fn() }),
}));

vi.mock("../hooks/useLiveLocations", () => ({
  default: vi.fn(),
}));
vi.mock("../../../hooks/useUserDirectory", () => ({
  default: vi.fn(),
}));

const useLiveLocations = (await import("../hooks/useLiveLocations")).default;
const useUserDirectory = (await import("../../../hooks/useUserDirectory")).default;

beforeEach(() => {
  markerCalls.length = 0;
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

    expect(screen.getByTestId("leaflet-map-container")).toBeInTheDocument();
    expect(markerCalls).toHaveLength(2);
    expect(markerCalls[0]).toMatchObject({ position: [12.9, 77.6], title: "Employee One" });
    expect(markerCalls[1]).toMatchObject({ position: [13.0, 77.7], title: "Employee Two" });

    // The legend list doubles as a human-readable check on the same data.
    expect(screen.getByText("Employee One")).toBeInTheDocument();
    expect(screen.getByText("Employee Two")).toBeInTheDocument();
  });

  it("shows an empty state with no markers when no one is currently visible/checked in", () => {
    useLiveLocations.mockReturnValue({ liveLocations: [], isLoading: false });

    render(<LiveMapView />);

    expect(markerCalls).toHaveLength(0);
    expect(screen.getByText(/No one is currently checked in/)).toBeInTheDocument();
  });
});
